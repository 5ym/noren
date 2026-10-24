import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  allowed,
  challengeOf,
  forget,
  readPending,
  safeReturn,
  verify,
} from "../src/lib/server/oidc";
import { create, destroy, find } from "../src/lib/server/session";

const ISSUER = "https://login.example/tenant/v2.0";
const CLIENT_ID = "test-client";

const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const KID = "test-key";
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const encode = (v: object) =>
  b64url(new TextEncoder().encode(JSON.stringify(v)));

async function idToken(
  claims: object,
  header: object = {},
  key = pair.privateKey,
) {
  const head = encode({ alg: "RS256", kid: KID, typ: "JWT", ...header });
  const body = encode(claims);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const NOW = Date.UTC(2026, 8, 12);
const base = {
  iss: ISSUER,
  aud: CLIENT_ID,
  sub: "user-1",
  name: "テスト 太郎",
  nonce: "n1",
  exp: Math.floor(NOW / 1000) + 3600,
};

const realFetch = globalThis.fetch;
beforeEach(async () => {
  forget();
  process.env.OIDC_ISSUER = `${ISSUER}/`;
  process.env.OIDC_CLIENT_ID = CLIENT_ID;
  process.env.OIDC_CLIENT_SECRET = "shhh";
  process.env.OIDC_ADMIN_ROLE = "";
  process.env.OIDC_STAFF_ROLE = "";
  process.env.OIDC_ROLE_CLAIM = "";
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/keys`,
      });
    }
    if (url.endsWith("/keys"))
      return Response.json({ keys: [{ ...jwk, kid: KID }] });
    throw new Error(`呼ばれるはずのない口: ${url}`);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("oidc", () => {
  test("正しい id_token は通り、中身が読める", async () => {
    const claims = await verify(
      await idToken({ ...base, roles: ["admin"] }),
      "n1",
      NOW,
    );
    expect(claims.sub).toBe("user-1");
    expect(claims.roles).toEqual(["admin"]);
  });

  test("署名・発行元・宛先・期限・nonce・alg のどれが違っても断る", async () => {
    const other = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    await expect(
      verify(await idToken(base, {}, other.privateKey), "n1", NOW),
    ).rejects.toThrow(/署名/);
    await expect(
      verify(await idToken({ ...base, iss: "https://evil" }), "n1", NOW),
    ).rejects.toThrow(/発行元/);
    await expect(
      verify(await idToken({ ...base, aud: "someone-else" }), "n1", NOW),
    ).rejects.toThrow(/宛先/);
    await expect(
      verify(await idToken({ ...base, exp: base.exp - 7200 }), "n1", NOW),
    ).rejects.toThrow(/期限/);
    await expect(verify(await idToken(base), "other", NOW)).rejects.toThrow(
      /合言葉/,
    );
    await expect(
      verify(await idToken(base, { alg: "none" }), "n1", NOW),
    ).rejects.toThrow(/署名方式/);
    await expect(
      verify(await idToken(base, { alg: "HS256" }), "n1", NOW),
    ).rejects.toThrow(/署名方式/);
  });

  test("管理者のロールなら admin、スタッフのロールだけなら staff。groups でもよい", () => {
    expect(allowed({ ...base, roles: ["admin"] })).toEqual({
      ok: true,
      role: "admin",
    });
    expect(allowed({ ...base, groups: ["admin", "staff"] })).toEqual({
      ok: true,
      role: "admin",
    });
    expect(allowed({ ...base, roles: ["staff"] })).toEqual({
      ok: true,
      role: "staff",
    });
    expect(allowed({ ...base, roles: ["reader"] }).ok).toBe(false);
    expect(allowed(base).ok).toBe(false);
    expect(
      allowed({ ...base, _claim_names: { groups: "src1" } }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("多すぎ") });
    // ロールの値は差し替えられる
    process.env.OIDC_ADMIN_ROLE = "boss";
    process.env.OIDC_STAFF_ROLE = "crew";
    expect(allowed({ ...base, roles: ["admin"] }).ok).toBe(false);
    expect(allowed({ ...base, roles: ["crew"] })).toEqual({
      ok: true,
      role: "staff",
    });
    expect(allowed({ ...base, roles: ["boss"] })).toEqual({
      ok: true,
      role: "admin",
    });
  });

  test("OIDC_ROLE_CLAIM で入れ子の claim からロールを読む(Keycloak の realm_access.roles など)", async () => {
    process.env.OIDC_ROLE_CLAIM = "realm_access.roles";
    const claims = await verify(
      await idToken({
        ...base,
        roles: ["admin"],
        realm_access: { roles: ["staff"] },
      }),
      "n1",
      NOW,
    );
    expect(claims.custom).toEqual(["staff"]);
    // 指定したら roles / groups は見ない
    expect(allowed(claims)).toEqual({ ok: true, role: "staff" });
    process.env.OIDC_ROLE_CLAIM = "role";
    const single = await verify(
      await idToken({ ...base, role: "admin" }),
      "n1",
      NOW,
    );
    expect(allowed(single)).toEqual({ ok: true, role: "admin" });
  });

  test("PKCE と戻り先と途中の控え", async () => {
    expect(
      await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(safeReturn(null)).toBe("/");
    expect(safeReturn("//evil.example")).toBe("/");
    expect(safeReturn("/\\evil.example")).toBe("/");
    expect(safeReturn("https://evil.example")).toBe("/");
    expect(safeReturn("/admin/x")).toBe("/admin/x");
    expect(readPending(undefined)).toBeNull();
    expect(readPending("{bad")).toBeNull();
    expect(
      readPending(JSON.stringify({ state: "s", nonce: "n", verifier: "v" })),
    ).toBeNull();
    expect(
      readPending(
        JSON.stringify({ state: "s", nonce: "n", verifier: "v", to: "/admin" }),
      )?.to,
    ).toBe("/admin");
  });
});

describe("session", () => {
  test("作った控えは引けて、消せば引けない", () => {
    const s = create("user-1", "テスト 太郎", "staff");
    expect(find(s.id)).toMatchObject({ subject: "user-1", role: "staff" });
    expect(find("nope")).toBeNull();
    expect(find(undefined)).toBeNull();
    destroy(s.id);
    expect(find(s.id)).toBeNull();
  });
});
