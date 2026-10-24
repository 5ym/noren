import { error } from "@sveltejs/kit";

import { getProduct, imageMime, imagePathOf } from "#lib/server/products.js";

import type { RequestHandler } from "./$types";

/** 商品画像。URL に updatedAt を付けて出しているので長く持たせてよい。 */
export const GET: RequestHandler = async ({ params }) => {
  const type = imageMime(params.name);
  if (!type || !getProduct(params.slug)) error(404);
  const file = Bun.file(imagePathOf(params.slug, params.name));
  if (!(await file.exists())) error(404);
  return new Response(file, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400",
    },
  });
};
