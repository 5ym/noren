import { redirect } from "@sveltejs/kit";

import { COOKIE, destroy } from "#lib/server/session.js";

import type { RequestHandler } from "./$types";

/** POST だけ。リンクを踏ませてログアウトさせられないように。 */
export const POST: RequestHandler = ({ cookies }) => {
  destroy(cookies.get(COOKIE));
  cookies.delete(COOKIE, { path: "/" });
  redirect(303, "/");
};
