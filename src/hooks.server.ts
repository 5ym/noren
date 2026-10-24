import { redirect } from "@sveltejs/kit";
import type { Handle, ServerInit } from "@sveltejs/kit/hooks";

import { enabled } from "#lib/server/oidc.js";
import { seedIfEmpty } from "#lib/server/products.js";
import { COOKIE, find } from "#lib/server/session.js";

/** 起動時に一度だけ。設定漏れは早く、ログの先頭で分かるように。 */
export const init: ServerInit = () => {
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    if (!process.env[name])
      console.warn(`${name} が空です。カードなどのオンライン決済は動きません`);
  }
  if (!process.env.PUBLIC_URL) {
    console.warn(
      "PUBLIC_URL が空です。メールのリンクはリクエストの Host から作ります(本番では入れてください)",
    );
  }
  if (!process.env.SMTP_HOST) {
    console.warn("SMTP_HOST が空です。メールは送らず標準出力に出します");
  }
  if (!enabled()) {
    console.warn(
      "OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET が揃っていません。管理画面とスタッフ画面は開けません",
    );
  }
  seedIfEmpty();
};

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * 管理画面 `/admin` は admin のロール、スタッフ画面 `/staff` は staff か admin のロールで
 * ログインした人だけ。IdP とのやり取りは /login と /login/callback に閉じてあり、
 * 普段のリクエストで外へ出ることはない。ロールはログインを通った時点で確かめてある。
 */
export const handle: Handle = async ({ event, resolve }) => {
  const session = find(event.cookies.get(COOKIE));
  if (session) {
    event.locals.user = {
      subject: session.subject,
      name: session.name,
      role: session.role,
    };
  }

  const { pathname, search } = event.url;
  const admin = under(pathname, "/admin");
  if (admin || under(pathname, "/staff")) {
    if (!enabled())
      return new Response(
        "管理画面とスタッフ画面は OIDC を設定すると開きます",
        { status: 404 },
      );
    const user = event.locals.user;
    if (!user) {
      // 画面の読み込みだけログインへ送る。fetch やフォームは 401 のほうが分かる
      const wantsHtml =
        event.request.headers.get("accept")?.includes("text/html") === true;
      if (event.request.method !== "GET" || !wantsHtml) {
        return new Response("login required", { status: 401 });
      }
      redirect(302, `/login?to=${encodeURIComponent(pathname + search)}`);
    }
    if (admin && user.role !== "admin") {
      return new Response("管理者のロールが要ります", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }
  return resolve(event);
};
