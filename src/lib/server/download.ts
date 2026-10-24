import { existsSync } from "node:fs";

import type { Order } from "../order";
import { DOWNLOAD_DAYS } from "../shop";
import { filePath, getProduct } from "./products";
import { orderByToken } from "./purchase";

export type Download = { path: string } | { status: 404 | 410 };

/** ダウンロードの期限(ms)。支払った日から DOWNLOAD_DAYS 日 */
export const downloadUntil = (order: Pick<Order, "paidAt">) =>
  order.paidAt === null ? null : order.paidAt + DOWNLOAD_DAYS * 86_400_000;

/**
 * メールのリンクをファイルに解決する。token が知らないもの・支払われていないもの・
 * 注文に無い商品・商品に無いファイル名・実体が無いものは全部 404 で、区別は付けない
 * (推測の足掛かりにしない)。期限切れだけ 410 で、購入者に「切れている」と伝える。
 */
export function resolveDownload(
  token: string,
  slug: string,
  file: string,
): Download {
  const order = orderByToken(token);
  if (!order || order.status !== "paid") return { status: 404 };
  if (!order.items.some((i) => i.kind === "download" && i.productSlug === slug))
    return { status: 404 };
  const product = getProduct(slug);
  if (!product?.files.includes(file)) return { status: 404 };
  const until = downloadUntil(order);
  if (until !== null && Date.now() > until) return { status: 410 };
  const path = filePath(product.slug, file);
  if (!existsSync(path)) return { status: 404 };
  return { path };
}
