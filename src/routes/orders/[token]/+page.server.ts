import { error } from "@sveltejs/kit";

import { needsHanding } from "#lib/order.js";
import { downloadUntil } from "#lib/server/download.js";
import { getProduct } from "#lib/server/products.js";
import { orderByToken } from "#lib/server/purchase.js";
import { qrSvg, staffUrl } from "#lib/server/qr.js";
import { siteOrigin } from "#lib/server/site.js";

import type { PageServerLoad } from "./$types";

/**
 * 客の注文ページ。メールのリンク(`/orders/<token>`)で開く。アカウントは無く、
 * token を知っていることが本人である証拠。会場で渡すものは受け取り・入場の QR、
 * ダウンロード商品はファイルのリンクを出す。
 */
export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
  const order = orderByToken(params.token);
  // 決済画面を開いただけの注文は、まだ客のものではない
  if (!order || order.status === "open") error(404, "注文が見つかりません");
  // URL が鍵なので、リンク先へ Referer で漏らさない・どこにも残さない
  setHeaders({ "referrer-policy": "no-referrer", "cache-control": "no-store" });

  const showQr =
    needsHanding(order) &&
    (order.status === "paid" || order.status === "unpaid");
  const until = downloadUntil(order);
  const downloads =
    order.status === "paid"
      ? order.items
          .filter((i) => i.kind === "download")
          .flatMap((i) =>
            (getProduct(i.productSlug)?.files ?? []).map((file) => ({
              file,
              href: `/dl/${order.token}/${encodeURIComponent(i.productSlug)}/${encodeURIComponent(file)}`,
            })),
          )
      : [];
  return {
    order: {
      // 鍵(token)はもう URL にあるので返さなくてよい。QR の番号は見せる(口頭で伝えられるように)
      code: order.code,
      status: order.status,
      method: order.method,
      name: order.name,
      email: order.email,
      amount: order.amount,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      handedAt: order.handedAt,
      items: order.items,
    },
    qr: showQr ? await qrSvg(staffUrl(siteOrigin(url), order.code)) : null,
    downloads,
    downloadUntil: until,
    expired: until !== null && Date.now() > until,
    fresh: url.searchParams.has("new"),
  };
};
