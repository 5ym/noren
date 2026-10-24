/**
 * e2e のときにアプリを起動する側。Playwright の webServer から `bun e2e/serve.ts` で呼ばれる。
 *
 * 本物の IdP・Stripe・SMTP・chat の通知先の代わりを同じプロセスに立ててから、ビルド済みの
 * アプリ(build/index.js)を読み込む。アプリは環境変数しか見ないので、ここで向き先を
 * 全部ローカルにすれば、コードに e2e 用の分岐は要らない。
 *
 *   4173  アプリ本体
 *   4174  偽 IdP(OIDC)・偽 Stripe の API・メールの覗き窓・通知の受け口
 *   4175  偽 SMTP
 *
 * 本番のコードとは 1 行も共有しない(ここが壊れてもアプリは壊れない)。
 */
import { mkdirSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";

const APP = 4173;
const SIDE = 4174;
const SMTP = 4175;
const ISSUER = `http://127.0.0.1:${SIDE}/idp`;
const CLIENT_ID = "noren-e2e";

// ---- 環境。アプリを import する前に決める ------------------------------------------
const TMP = join(import.meta.dir, ".tmp");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
Object.assign(process.env, {
  PORT: String(APP),
  HOST: "127.0.0.1",
  // adapter-bun に ORIGIN は無い。前段が付けるはずのヘッダから origin を
  // 組ませる(無いと https 扱いで、平文の 127.0.0.1 からのフォーム送信が CSRF で 403)。
  // ヘッダはテスト側が付ける(playwright.config.ts の extraHTTPHeaders)
  PROTOCOL_HEADER: "x-forwarded-proto",
  BODY_SIZE_LIMIT: "Infinity",
  DB_PATH: join(TMP, "noren.db"),
  PRODUCTS_DIR: join(TMP, "products"),
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e",
  // Checkout の Session を作る・読む先を偽 Stripe に向ける
  STRIPE_API_URL: `http://127.0.0.1:${SIDE}`,
  SQUARE_APPLICATION_ID: "sq0idp-e2e",
  OIDC_ISSUER: ISSUER,
  OIDC_CLIENT_ID: CLIENT_ID,
  OIDC_CLIENT_SECRET: "shhh",
  OIDC_ADMIN_ROLE: "admin",
  OIDC_STAFF_ROLE: "staff",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(SMTP),
  SMTP_STARTTLS: "false",
  SMTP_USER: "shop",
  SMTP_PASSWORD: "secret",
  MAIL_FROM: "shop@example.test",
  SHOP_MAIL_TO: "shop@example.test",
  NOTIFY_WEBHOOK_URL: `http://127.0.0.1:${SIDE}/hooks/notify`,
});

// ---- 偽 IdP: 認可コードフロー + PKCE を最小限に。画面は出さず、決めたロールで通す ------------
// ロールは POST /idp/role で次のログインから変えられる(既定 admin。"none" はロール無し)
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
const KID = "e2e";
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const enc = (v: object) => b64url(new TextEncoder().encode(JSON.stringify(v)));
async function idToken(claims: object) {
  const head = enc({ alg: "RS256", kid: KID, typ: "JWT" });
  const body = enc(claims);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
/** 発行した code とそのログインの nonce・ロール。token で引き換える */
const codes = new Map<string, { nonce: string; role: string }>();
let nextRole = "admin";
/** 偽 Stripe が作った Checkout の Session */
const sessions = new Map<string, Record<string, unknown>>();

// ---- 受け取ったメールと通知。テストが /mails と /posts で読む ------------------------
export interface Mail {
  from: string;
  to: string[];
  subject: string;
  /** 最初の text/plain パートを base64 から戻したもの。添付は入らない */
  text: string;
  raw: string;
}
const mails: Mail[] = [];
const posts: { text: string }[] = [];

/** multipart なら最初の text/plain パート、そうでなければ全体の本文を base64 から戻す */
function bodyText(raw: string): string {
  const boundary = raw.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  const part = boundary
    ? raw
        .split(`--${boundary}`)
        .find((p) => /content-type: text\/plain/i.test(p))
    : raw;
  if (!part) return "";
  const body = part.slice(part.indexOf("\r\n\r\n") + 4);
  return /content-transfer-encoding: base64/i.test(part)
    ? Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8")
    : body;
}

const decodeWord = (s: string) =>
  s
    .split(/\r\n\s/)
    .map((w) => {
      const m = w.match(/^=\?UTF-8\?B\?(.*)\?=$/);
      return m ? Buffer.from(m[1], "base64").toString("utf8") : w;
    })
    .join("");

Bun.serve({
  port: SIDE,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === "/idp/.well-known/openid-configuration") {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/keys`,
      });
    }
    if (p === "/idp/keys") {
      const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
      return Response.json({ keys: [{ ...jwk, kid: KID }] });
    }
    if (p === "/idp/role" && req.method === "POST") {
      nextRole = await req.text();
      return new Response("ok");
    }
    if (p === "/idp/authorize") {
      // 画面は出さない。すぐ code を持って戻す
      const code = crypto.randomUUID();
      codes.set(code, {
        nonce: url.searchParams.get("nonce") ?? "",
        role: nextRole,
      });
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      return Response.redirect(back.toString(), 302);
    }
    if (p === "/idp/token" && req.method === "POST") {
      const form = new URLSearchParams(await req.text());
      const login = codes.get(form.get("code") ?? "");
      if (login === undefined || form.get("client_secret") !== "shhh") {
        return Response.json(
          { error_description: "bad code" },
          { status: 400 },
        );
      }
      return Response.json({
        id_token: await idToken({
          iss: ISSUER,
          aud: CLIENT_ID,
          sub: `e2e-${login.role}`,
          name: login.role === "staff" ? "E2E スタッフ" : "E2E 管理者",
          nonce: login.nonce,
          exp: Math.floor(Date.now() / 1000) + 3600,
          roles: login.role === "none" ? ["reader"] : [login.role],
        }),
      });
    }
    // ---- 偽 Stripe。アプリの SDK が叩く API(/v1/…)と、テストが状態を変える口(/stripe/…) ----
    if (p === "/v1/checkout/sessions" && req.method === "POST") {
      // SDK は application/x-www-form-urlencoded の角かっこ記法で送ってくる
      const form = new URLSearchParams(await req.text());
      let amount = 0;
      for (let i = 0; form.has(`line_items[${i}][quantity]`); i++) {
        amount +=
          Number(form.get(`line_items[${i}][quantity]`)) *
          Number(form.get(`line_items[${i}][price_data][unit_amount]`));
      }
      const id = `cs_test_${crypto.randomUUID().replace(/-/g, "")}`;
      const session = {
        id,
        object: "checkout.session",
        url: `http://127.0.0.1:${SIDE}/stripe/pay/${id}`,
        mode: "payment",
        payment_status: "unpaid",
        status: "open",
        amount_total: amount,
        currency: "jpy",
        payment_method_types: ["card"],
        payment_intent: null,
        customer_details: null,
        client_reference_id: form.get("client_reference_id"),
        metadata: {
          order: form.get("metadata[order]") ?? "",
          origin: form.get("metadata[origin]") ?? "",
        },
        success_url: (form.get("success_url") ?? "").replace(
          "{CHECKOUT_SESSION_ID}",
          id,
        ),
        cancel_url: form.get("cancel_url"),
        line_items: [...form.keys()]
          .filter((k) =>
            /^line_items\[\d+\]\[price_data\]\[product_data\]\[name\]$/.test(k),
          )
          .map((k) => form.get(k)),
      };
      sessions.set(id, session);
      return Response.json(session);
    }
    const sessionMatch = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(p);
    if (sessionMatch && req.method === "GET") {
      const s = sessions.get(sessionMatch[1]);
      return s
        ? Response.json(s)
        : Response.json(
            {
              error: {
                type: "invalid_request_error",
                message: "No such session",
              },
            },
            { status: 404 },
          );
    }
    const piMatch = /^\/v1\/payment_intents\/([^/]+)$/.exec(p);
    if (piMatch && req.method === "GET") {
      // コンビニ払いの払込期限。3 日後
      return Response.json({
        id: piMatch[1],
        object: "payment_intent",
        next_action: {
          type: "konbini_display_details",
          konbini_display_details: {
            expires_at: Math.floor(Date.now() / 1000) + 3 * 86400,
          },
        },
      });
    }
    const testSession = /^\/stripe\/sessions\/([^/]+)$/.exec(p);
    if (testSession) {
      const s = sessions.get(testSession[1]);
      if (!s) return new Response("no session", { status: 404 });
      // 払ったことにする(テストが Webhook を送る前に、Session の中身を決める)
      if (req.method === "PATCH")
        Object.assign(s, (await req.json()) as Record<string, unknown>);
      return Response.json(s);
    }
    if (p.startsWith("/stripe/pay/")) {
      return new Response(
        '<!doctype html><html lang="ja"><title>偽の決済画面</title><h1>偽の決済画面</h1></html>',
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (p === "/hooks/notify" && req.method === "POST") {
      posts.push((await req.json()) as { text: string });
      return new Response("ok");
    }
    if (p === "/mails") {
      if (req.method === "DELETE") {
        mails.length = 0;
        return new Response("cleared");
      }
      return Response.json(mails);
    }
    if (p === "/posts") {
      if (req.method === "DELETE") {
        posts.length = 0;
        return new Response("cleared");
      }
      return Response.json(posts);
    }
    return new Response("not found", { status: 404 });
  },
});

// ---- 偽 SMTP。AUTH LOGIN(secret)を受け、DATA を 1 通として記録する ----------------
createServer((socket: Socket) => {
  let buffer = "";
  let inData = false;
  let from = "";
  const to: string[] = [];
  let data = "";
  let authStep = 0;
  socket.write("220 e2e ESMTP\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const end = buffer.indexOf("\r\n");
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line === ".") {
          inData = false;
          const subject = decodeWord(
            data.match(/^Subject: (.*(?:\r\n\s.*)*)/im)?.[1] ?? "",
          );
          mails.push({
            from,
            to: [...to],
            subject,
            text: bodyText(data),
            raw: data,
          });
          data = "";
          to.length = 0;
          socket.write("250 2.0.0 queued\r\n");
        } else data += `${line}\r\n`;
        continue;
      }
      const verb = line.split(" ")[0].toUpperCase();
      if (authStep === 1) {
        authStep = 2;
        socket.write("334 UGFzc3dvcmQ6\r\n");
      } else if (authStep === 2) {
        authStep = 0;
        socket.write(
          line === Buffer.from("secret").toString("base64")
            ? "235 2.7.0 ok\r\n"
            : "535 5.7.3 no\r\n",
        );
      } else if (verb === "EHLO" || verb === "HELO") {
        socket.write("250-e2e\r\n250-AUTH LOGIN\r\n250 SIZE 157286400\r\n");
      } else if (line.toUpperCase() === "AUTH LOGIN") {
        authStep = 1;
        socket.write("334 VXNlcm5hbWU6\r\n");
      } else if (verb === "MAIL") {
        from = line.match(/<([^>]*)>/)?.[1] ?? "";
        socket.write("250 OK\r\n");
      } else if (verb === "RCPT") {
        to.push(line.match(/<([^>]*)>/)?.[1] ?? "");
        socket.write("250 OK\r\n");
      } else if (verb === "DATA") {
        inData = true;
        socket.write("354 go ahead\r\n");
      } else if (verb === "QUIT") {
        socket.write("221 bye\r\n");
        socket.end();
      } else socket.write("250 OK\r\n");
    }
  });
}).listen(SMTP, "127.0.0.1");

// ---- アプリ。adapter-bun の index.js は import した時点で listen する -----------------
console.log(
  `[e2e] 偽 IdP/SMTP を上げた。アプリを http://127.0.0.1:${APP} で起動する`,
);
await import("../build/index.js");
