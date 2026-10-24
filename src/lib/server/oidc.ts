/**
 * OIDC(認可コードフロー + PKCE)で管理者とスタッフを確かめる。
 *
 * **ライブラリは入れていない。** 使う口は discovery・authorize・token・jwks の 4 つで、
 * 素の fetch と WebCrypto で足りる。誰を通すかは id_token のロール(またはグループ)で決める:
 * OIDC_ADMIN_ROLE(既定 admin)は管理画面とスタッフ画面、OIDC_STAFF_ROLE(既定 staff)は
 * スタッフ画面だけ。どちらも持たない人は断る。
 *
 * ここは「誰か」を確かめるだけで、画面を守るのは hooks.server.ts。
 */

import { randomToken } from "./random";

/** admin は管理画面とスタッフ画面、staff はスタッフ画面(受け取り・入場・当日販売)だけ */
export type Role = "admin" | "staff";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  /** 管理者のロール(またはグループ)の値 */
  adminRole: string;
  /** スタッフのロール(またはグループ)の値 */
  staffRole: string;
  /**
   * ロールを読む claim。点でつなぐと入れ子をたどる(Keycloak の `realm_access.roles` など)。
   * 空なら `roles` と `groups` の両方を読む(Entra ID のアプリロールや、groups を載せる IdP)
   */
  roleClaim: string;
}

/** 環境変数は毎回読む(テストが差し替えられるように)。 */
export function config(): OidcConfig {
  return {
    issuer: (process.env.OIDC_ISSUER ?? "").replace(/\/+$/, ""),
    clientId: process.env.OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
    scope: process.env.OIDC_SCOPE || "openid profile",
    adminRole: process.env.OIDC_ADMIN_ROLE || "admin",
    staffRole: process.env.OIDC_STAFF_ROLE || "staff",
    roleClaim: process.env.OIDC_ROLE_CLAIM || "",
  };
}

/** 3 つ揃っていなければ管理画面ごと閉じる。 */
export function enabled(): boolean {
  const c = config();
  return c.issuer !== "" && c.clientId !== "" && c.clientSecret !== "";
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discovered: Discovery | null = null;

async function discover(): Promise<Discovery> {
  if (discovered) return discovered;
  const url = `${config().issuer}/.well-known/openid-configuration`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok)
    throw new Error(`OIDC の設定を読めません (${res.status}) ${url}`);
  const doc = (await res.json()) as Partial<Discovery>;
  for (const key of [
    "issuer",
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
  ] as const) {
    if (typeof doc[key] !== "string")
      throw new Error(`OIDC の設定に ${key} がありません`);
  }
  discovered = doc as Discovery;
  return discovered;
}

/** テスト用。覚えているものを捨てる。 */
export function forget(): void {
  discovered = null;
  keys.clear();
}

const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64url");
const decodeBase64Url = (value: string) =>
  new Uint8Array(Buffer.from(value, "base64url"));

export async function challengeOf(verifier: string): Promise<string> {
  return base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
    ),
  );
}

export interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  /** ログインし終わったら戻る先 */
  to: string;
}

/**
 * 戻る先は自分のところの絶対パスだけ。`//evil` や `/\evil` で外へ飛ばす踏み台にしない。
 * 決まっていなければ "/"(ログインのあとロールに合った画面へ送る)。
 */
export function safeReturn(to: string | null): string {
  if (to === null || !to.startsWith("/") || /^\/[/\\]/.test(to)) return "/";
  return to;
}

/** IdP のクライアントに登録しておく戻り先。 */
export const redirectUri = (origin: string) =>
  new URL("/login/callback", origin).toString();

export function readPending(raw: string | undefined): Pending | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Pending>;
    const ok = (["state", "nonce", "verifier", "to"] as const).every(
      (k) => typeof v[k] === "string" && v[k] !== "",
    );
    return ok ? (v as Pending) : null;
  } catch {
    return null;
  }
}

export async function start(
  redirect: string,
  to: string,
): Promise<{ url: string; pending: Pending }> {
  const doc = await discover();
  const pending: Pending = {
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(),
    to,
  };
  const params = new URLSearchParams({
    client_id: config().clientId,
    response_type: "code",
    redirect_uri: redirect,
    // Entra ID の roles は openid だけで載る。profile は表示名のため。
    // IdP によってはロールに別の scope が要る(OIDC_SCOPE)
    scope: config().scope,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await challengeOf(pending.verifier),
    code_challenge_method: "S256",
  });
  return { url: `${doc.authorization_endpoint}?${params}`, pending };
}

/** コードを id_token に換える。秘密を使うのはここだけ(client_secret_post)。 */
async function exchange(
  code: string,
  redirect: string,
  verifier: string,
): Promise<string> {
  const doc = await discover();
  const c = config();
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    error_description?: string;
  };
  if (!res.ok || typeof body.id_token !== "string") {
    throw new Error(
      `引き換えに失敗しました (${res.status}) ${body.error_description ?? ""}`.trim(),
    );
  }
  return body.id_token;
}

/** kid ごとの公開鍵。見つからなければ取り直す(相手が鍵を入れ替えたとき)。 */
const keys = new Map<string, CryptoKey>();

async function publicKey(kid: string): Promise<CryptoKey> {
  const cached = keys.get(kid);
  if (cached) return cached;
  const doc = await discover();
  const res = await fetch(doc.jwks_uri, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`鍵を読めません (${res.status})`);
  const { keys: jwks } = (await res.json()) as {
    keys?: (JsonWebKey & { kid?: string })[];
  };
  for (const jwk of jwks ?? []) {
    if (jwk.kid === undefined || jwk.kty !== "RSA") continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        { ...jwk, key_ops: ["verify"], ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true,
        ["verify"],
      ),
    );
  }
  const found = keys.get(kid);
  if (!found) throw new Error(`ID トークンの鍵 (${kid}) が見つかりません`);
  return found;
}

export interface Claims {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  groups?: string[];
  roles?: string[];
  /** OIDC_ROLE_CLAIM で指定した claim の値(指定したときだけ) */
  custom?: string[];
  _claim_names?: Record<string, string>;
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  nonce?: string;
}

const SKEW = 60;

const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : undefined;

function readClaims(raw: unknown): Claims {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (
    typeof o.sub !== "string" ||
    typeof o.iss !== "string" ||
    typeof o.exp !== "number"
  ) {
    throw new Error("ID トークンの形が違います");
  }
  const aud = typeof o.aud === "string" ? o.aud : strings(o.aud);
  if (aud === undefined) throw new Error("ID トークンに aud がありません");
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : undefined;
  const path = config().roleClaim;
  let custom: string[] | undefined;
  if (path) {
    let v: unknown = o;
    for (const key of path.split(".")) {
      v =
        typeof v === "object" && v !== null
          ? (v as Record<string, unknown>)[key]
          : undefined;
    }
    custom = typeof v === "string" ? [v] : (strings(v) ?? []);
  }
  return {
    custom,
    sub: o.sub,
    iss: o.iss,
    exp: o.exp,
    aud,
    nbf: typeof o.nbf === "number" ? o.nbf : undefined,
    nonce: str("nonce"),
    name: str("name"),
    preferred_username: str("preferred_username"),
    email: str("email"),
    groups: strings(o.groups),
    roles: strings(o.roles),
    _claim_names:
      typeof o._claim_names === "object" && o._claim_names !== null
        ? (o._claim_names as Record<string, string>)
        : undefined,
  };
}

/**
 * ID トークンを開いて中身を確かめる。**署名まで見る。** 認可コードフローでは TLS 越しに
 * 相手から直に受け取るので仕様上は省けるが、省くと「どこから受け取ったか」に安全が乗る。
 */
export async function verify(
  token: string,
  nonce: string,
  at = Date.now(),
): Promise<Claims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("ID トークンの形が違います");
  const [rawHeader, rawPayload, rawSignature] = parts;
  const header = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(rawHeader)),
  ) as {
    alg?: unknown;
    kid?: unknown;
  };
  // none を受けると署名を見ない道ができる。受けるのは RS256 だけ
  if (header.alg !== "RS256")
    throw new Error(`受けられない署名方式です (${header.alg})`);
  if (typeof header.kid !== "string")
    throw new Error("ID トークンに鍵の名前がありません");

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await publicKey(header.kid),
    decodeBase64Url(rawSignature),
    encoder.encode(`${rawHeader}.${rawPayload}`),
  );
  if (!ok) throw new Error("ID トークンの署名が合いません");

  const claims = readClaims(
    JSON.parse(new TextDecoder().decode(decodeBase64Url(rawPayload))),
  );
  const doc = await discover();
  if (claims.iss !== doc.issuer)
    throw new Error("ID トークンの発行元が違います");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(config().clientId))
    throw new Error("ID トークンの宛先が違います");
  const seconds = Math.floor(at / 1000);
  if (claims.exp + SKEW < seconds)
    throw new Error("ID トークンの期限が切れています");
  if (claims.nbf !== undefined && claims.nbf - SKEW > seconds) {
    throw new Error("ID トークンがまだ有効ではありません");
  }
  if (claims.nonce !== nonce)
    throw new Error("ID トークンの合言葉が合いません");
  if (claims.sub === "") throw new Error("ID トークンに sub がありません");
  return claims;
}

/**
 * 通していい人か。誰であるかではなく、ロール(またはグループ)で決める。
 * 管理者のロールがあれば admin(スタッフ画面も開ける)、スタッフのロールだけなら staff。
 */
export function allowed(
  claims: Claims,
): { ok: true; role: Role } | { ok: false; reason: string } {
  const c = config();
  const held = claims.custom ?? [
    ...(claims.groups ?? []),
    ...(claims.roles ?? []),
  ];
  if (held.length === 0) {
    const overflow = claims._claim_names?.groups !== undefined;
    return {
      ok: false,
      reason: overflow
        ? "グループが多すぎて ID トークンに載っていません (Entra ID の _claim_names)。グループではなくアプリのロールを使ってください"
        : `ID トークンにロールがありません。IdP でこのユーザーに ${c.adminRole} か ${c.staffRole} のロールを割り当て、ロールが ID トークンに載るようにしてください (${c.roleClaim || "roles / groups"})`,
    };
  }
  if (held.includes(c.adminRole)) return { ok: true, role: "admin" };
  if (held.includes(c.staffRole)) return { ok: true, role: "staff" };
  return {
    ok: false,
    reason: `ロール ${c.adminRole} も ${c.staffRole} も持っていません`,
  };
}

export const displayName = (c: Claims) =>
  c.name ?? c.preferred_username ?? c.email ?? "";

export async function complete(
  code: string,
  redirect: string,
  pending: Pending,
): Promise<{ subject: string; name: string; role: Role }> {
  const claims = await verify(
    await exchange(code, redirect, pending.verifier),
    pending.nonce,
  );
  const verdict = allowed(claims);
  if (!verdict.ok) throw new Error(verdict.reason);
  return { subject: claims.sub, name: displayName(claims), role: verdict.role };
}
