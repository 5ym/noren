import { error, json } from "@sveltejs/kit";

import { ProductError, saveFile } from "#lib/server/products.js";

import type { RequestHandler } from "./$types";

/**
 * ファイルのアップロード。multipart ではなく本文そのものを PUT で受け、そのまま
 * ディスクに流す。数百 MB のカタログを formData() でメモリに載せないため。
 * 管理画面の <script> が fetch で叩く(hooks.server.ts がログインを確かめている)。
 */
export const PUT: RequestHandler = async ({ params, request, url }) => {
  // Cookie は SameSite=Lax なので他所からは付かないが、Origin も見ておく
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== url.origin) error(403, "origin が違います");
  if (!request.body) error(400, "本文がありません");
  try {
    await saveFile(params.slug, params.name, request.body);
  } catch (e) {
    if (e instanceof ProductError) error(400, e.message);
    throw e;
  }
  return json({ ok: true });
};
