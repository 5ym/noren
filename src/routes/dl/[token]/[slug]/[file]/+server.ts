import { error } from "@sveltejs/kit";

import { resolveDownload } from "#lib/server/download.js";

import type { RequestHandler } from "./$types";

/** メールと注文ページに書いたダウンロード用リンク。 */
export const GET: RequestHandler = ({ params }) => {
  const found = resolveDownload(params.token, params.slug, params.file);
  if ("status" in found) {
    error(
      found.status,
      found.status === 410
        ? "ダウンロードの期限が切れています"
        : "ファイルが見つかりません",
    );
  }
  return new Response(Bun.file(found.path), {
    headers: {
      "content-type": "application/octet-stream",
      // RFC 5987: 日本語のファイル名でも壊れない形
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(params.file)}`,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
};
