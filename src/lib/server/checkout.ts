import { itemLabel, type Order } from "../order";
import { imageUrl, type ProductView, yen } from "../product";
import db from "./db";
import { deliver } from "./deliver";
import type { Sender } from "./mail";
import { notify } from "./notify";
import {
  attachSession,
  createOrder,
  markMailed,
  type NewItem,
  recentReservations,
} from "./purchase";
import { SelectionError } from "./selection";
import stripe from "./stripe";

/** 同じメールアドレスで、この時間(ms)のあいだに受ける予約・申し込みの数 */
const RESERVE_WINDOW = 60 * 60 * 1000;
const RESERVE_LIMIT = 5;

/**
 * Stripe を通さない注文。値段が 0 の商品は「申し込み」(そのまま支払い済み)、
 * 当日払いを受ける商品は「予約」(当日払い・未払い。会場で現金を受けたら支払い済み)。
 * 連絡先はこちらのフォームで聞き、注文ページのリンクをメールで送る。
 * メールが送れなくても注文は残す(画面はそのまま注文ページへ進むので、客は QR を持てる)。
 */
export async function reserve(
  product: ProductView,
  items: NewItem[],
  contact: { email: string; name: string },
  origin: string,
  send?: Sender,
): Promise<Order> {
  const free = product.price === 0;
  if (!free && (!product.payOnSite || product.kind === "download"))
    throw new SelectionError("この商品は当日払いの予約を受けていません");
  // 認証の無い口なので、同じアドレス宛の連投(他人のアドレスへのメール爆撃)を止める
  if (recentReservations(contact.email, RESERVE_WINDOW) >= RESERVE_LIMIT)
    throw new SelectionError(
      "このメールアドレスでの予約が続いています。しばらくしてからお試しください",
    );
  const order = createOrder({
    channel: "online",
    method: free ? "free" : "cash",
    status: free ? "paid" : "unpaid",
    email: contact.email,
    name: contact.name,
    items,
  });
  const summary = `**${items.map(itemLabel).join("・")}** ${yen(order.amount)} / ${contact.email}`;
  try {
    await deliver(order, origin, send);
    markMailed(order.id);
    notify(`${free ? "📝 申し込み" : "🎫 予約(当日払い)"} ${summary}`);
  } catch (e) {
    console.error("予約のメールが送れませんでした:", order.id, e);
    notify(
      `⚠️ 予約のメール失敗 ${summary}\n${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return order;
}

/**
 * 「購入する」。注文を「決済前」(open)で先に記録してから Stripe Checkout の Session を作り、
 * その URL を返す。明細と値段はこちらの DB が持ち、Webhook は metadata の注文番号だけを頼りに
 * 状態を進める(src/lib/server/webhook.ts)。カートは無く、1 つの商品を種類ごとの数量で買う。
 */
export async function startCheckout(
  product: ProductView,
  items: NewItem[],
  origin: string,
): Promise<string> {
  const order = createOrder({
    channel: "online",
    method: "stripe",
    status: "open",
    items,
  });
  const image = imageUrl(product);
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      locale: "ja",
      line_items: items.map((i) => ({
        quantity: i.count,
        price_data: {
          currency: "jpy",
          unit_amount: i.price,
          product_data: {
            name: itemLabel(i),
            // Stripe が取りに来るので、外から届く https の URL のときだけ渡す
            ...(image && origin.startsWith("https://")
              ? { images: [`${origin}${image}`] }
              : {}),
          },
        },
      })),
      client_reference_id: String(order.id),
      // origin はメールに書くリンクのため: Webhook は Stripe から届くので、
      // そのリクエストからはこのサイトのホスト名が分からない
      metadata: { order: String(order.id), origin },
      success_url: `${origin}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/items/${product.slug}`,
    });
    if (!session.url) throw new Error("Checkout の URL がありません");
    attachSession(order.id, session.id);
    return session.url;
  } catch (e) {
    // 決済画面を作れなかった注文は残しても意味が無い
    db().run("DELETE FROM purchase WHERE id = ? AND status = 'open'", [
      order.id,
    ]);
    throw e;
  }
}
