import { statSync } from "node:fs";

import {
  handWord,
  itemLabel,
  methodLabel,
  needsHanding,
  type Order,
} from "../order";
import { yen } from "../product";
import { DOWNLOAD_DAYS } from "../shop";
import { type Attachment, type Sender, sendMail } from "./mail";
import { filePath, getProduct } from "./products";
import { shop, shopMailTo } from "./settings";

/**
 * 添付にするのはここまで。送る側の上限は SMTP サーバ次第で、受け取る側の
 * 上限も分からない(Gmail は 25MB)。これを超える商品はリンクだけ送る。
 */
const ATTACH_LIMIT = 20 * 1024 * 1024;

export const orderUrl = (origin: string, order: Pick<Order, "token">) =>
  `${origin}/orders/${order.token}`;

export const downloadUrl = (
  origin: string,
  order: Pick<Order, "token">,
  slug: string,
  file: string,
) =>
  `${origin}/dl/${order.token}/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`;

/** 注文に入っているダウンロード商品のファイル。商品が消えた・ファイルが無いなら投げる */
function downloads(order: Order) {
  const out: { slug: string; file: string; path: string }[] = [];
  for (const item of order.items) {
    if (item.kind !== "download") continue;
    const product = getProduct(item.productSlug);
    if (!product) throw new Error(`商品 ${item.productSlug} がありません`);
    if (product.files.length === 0)
      throw new Error(`商品 ${item.productSlug} にファイルがありません`);
    for (const file of product.files) {
      out.push({
        slug: product.slug,
        file,
        path: filePath(product.slug, file),
      });
    }
  }
  return out;
}

/**
 * 客に注文の控えを送り、店にも控えを送る。ダウンロード商品はファイルを添付(合計 20MB まで)
 * し、リンクも書く。会場で渡すものは、QR が出る注文ページのリンクを書く。
 * どちらかで失敗したら投げる(Webhook なら Stripe に 500 を返して再送させる)。
 */
export async function deliver(
  order: Order,
  origin: string,
  send: Sender = sendMail,
): Promise<void> {
  if (!order.email) throw new Error(`注文 ${order.id} に送り先がありません`);
  const s = shop();
  const files = downloads(order);
  const total = files.reduce((sum, f) => sum + statSync(f.path).size, 0);
  const attachments: Attachment[] =
    files.length > 0 && total <= ATTACH_LIMIT
      ? files.map((f) => ({ filename: f.file, path: f.path }))
      : [];
  const onSite = needsHanding(order);
  const word = handWord(order);
  const unpaid = order.status === "unpaid";
  const lines = order.items.map(
    (i) => `  ${itemLabel(i)} × ${i.count}  ${yen(i.price * i.count)}`,
  );
  const firstName = order.items[0]?.productName ?? "";

  const subject =
    files.length > 0 && !onSite
      ? `【${s.name}】${firstName} をお送りします`
      : unpaid
        ? `【${s.name}】ご予約を承りました`
        : `【${s.name}】ご注文を承りました`;

  await send({
    to: order.email,
    subject,
    text: [
      `${order.name ?? ""} 様`,
      "",
      `${s.name} をご利用いただきありがとうございます。ご注文の内容です。`,
      "",
      ...lines,
      `  合計 ${yen(order.amount)}(${unpaid ? "当日、会場でお支払い" : order.amount === 0 ? "無料" : "お支払い済み"})`,
      "",
      ...(files.length > 0
        ? [
            attachments.length > 0
              ? "ファイルはこのメールに添付しています。添付が開けない場合は、下記からもダウンロードできます。"
              : "ファイルは下記からダウンロードしてください。",
            `(リンクは ${DOWNLOAD_DAYS} 日間有効です)`,
            "",
            ...files.map((f) => downloadUrl(origin, order, f.slug, f.file)),
            "",
          ]
        : []),
      ...(onSite
        ? [
            `${word}のときは、下の注文ページに出る QR コードを会場のスタッフにお見せください。`,
            ...(unpaid
              ? [
                  `${word}のときに、現金で ${yen(order.amount)} をお支払いください。`,
                ]
              : []),
            "",
          ]
        : []),
      "注文ページ:",
      orderUrl(origin, order),
      "(このリンクを知っている人は誰でも注文を見られます。人に転送しないでください)",
      "",
      ...(s.email ? [`ご不明な点は ${s.email} までご連絡ください。`, ""] : []),
      s.name,
      origin,
    ].join("\n"),
    attachments,
  });

  const to = shopMailTo();
  if (!to) return;
  await send({
    to,
    subject: `【${unpaid ? "予約" : "注文"}】${firstName} ${yen(order.amount)} ${order.email}`,
    text: [
      ...order.items.map((i) => `${itemLabel(i)} × ${i.count}`),
      `金額: ${yen(order.amount)}`,
      `支払い: ${methodLabel(order.method)}${unpaid ? "(当日払い・未払い)" : ""}`,
      `購入者: ${order.name ?? "(名前なし)"} <${order.email}>`,
      `日時: ${new Date(order.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
      ...(files.length > 0
        ? [
            `添付: ${attachments.length > 0 ? "あり" : `なし(合計 ${total} バイト、リンクのみ)`}`,
          ]
        : []),
      ...(order.sessionId
        ? [
            `Checkout Session: ${order.sessionId}`,
            `Stripe: https://dashboard.stripe.com/payments?query=${encodeURIComponent(order.sessionId)}`,
          ]
        : []),
      `管理画面: ${origin}/admin/orders`,
    ].join("\n"),
  });
}
