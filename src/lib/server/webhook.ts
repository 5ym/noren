import type Stripe from "stripe";

import { itemLabel, type Order } from "../order";
import { yen } from "../product";
import { deliver } from "./deliver";
import type { Sender } from "./mail";
import { notify } from "./notify";
import {
  claimMail,
  completeCheckout,
  getOrder,
  markUnpaid,
  orderBySession,
  releaseMail,
} from "./purchase";
import stripe from "./stripe";

/**
 * 扱う Checkout のイベント。
 *   completed               … 注文が入った。カードならこの時点で paid、
 *                             コンビニ払い・銀行振込は unpaid(入金待ちとして記録)
 *   async_payment_succeeded … 入金待ちだった注文が支払われた
 *   async_payment_failed    … 入金されずに終わった(コンビニの払込期限切れなど)
 *   expired                 … 決済画面のまま失効した(24 時間)
 * Stripe のダッシュボードで Webhook にこの 4 つを登録しておくこと。
 */
const HANDLED = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

const text = (status: number, body: string) => new Response(body, { status });

/**
 * コンビニ払いの払込期限。PaymentIntent の next_action にしか無いので 1 回取りに行く。
 * 銀行振込には Stripe 側の期限が無い(セッションの失効まで)。取れなければ null。
 */
async function paymentDeadline(
  session: Stripe.Checkout.Session,
): Promise<number | null> {
  if (typeof session.payment_intent !== "string") return null;
  try {
    const pi = await stripe().paymentIntents.retrieve(session.payment_intent);
    const sec = pi.next_action?.konbini_display_details?.expires_at;
    return sec ? sec * 1000 : null;
  } catch (e) {
    console.warn("払込期限が取れませんでした:", session.id, e);
    return null;
  }
}

/** metadata の注文番号で引く。無ければ Session ID で */
function findOrder(session: Stripe.Checkout.Session): Order | null {
  const id = Number(session.metadata?.order);
  const byId = Number.isInteger(id) && id > 0 ? getOrder(id) : null;
  return byId ?? orderBySession(session.id);
}

/**
 * Stripe からの Webhook。署名を検証し、支払い済みなら記録して納品する。
 * 200 以外を返すと Stripe が再送する(最長 3 日)ので、メールが送れなかったときだけ
 * 500 にして次の配信で送り直す。それ以外の「何もしない」は全部 200: 再送されても
 * 結果は変わらない。
 */
export async function handleWebhook(
  rawBody: string,
  signature: string | null,
  fallbackOrigin: string,
  send?: Sender,
): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET が設定されていません");
    return text(500, "webhook secret not configured");
  }
  if (!signature) return text(400, "missing signature");

  let event: Stripe.Event;
  try {
    // Bun では SDK が SubtleCrypto を選ぶので、同期版の constructEvent は投げる
    event = await stripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
    );
  } catch (e) {
    // SDK のエラーは付随情報が多いので、メッセージだけ
    console.warn(
      "Webhook の署名が合いません:",
      e instanceof Error ? e.message : e,
    );
    return text(400, "invalid signature");
  }

  if (!HANDLED.has(event.type)) return text(200, "ignored");
  const session = event.data.object as Stripe.Checkout.Session;
  const order = findOrder(session);
  const email = session.customer_details?.email ?? null;
  const what = order ? order.items.map(itemLabel).join("・") : "(注文不明)";
  const summary = `**${what}** ${yen(session.amount_total ?? 0)} / ${email ?? "(メール不明)"}`;
  const method = session.payment_method_types?.[0] ?? null;

  if (!order) {
    // 設定の食い違い(別の店の Webhook が届いた、DB を作り直した など)。
    // 再送されても直らないので 200 で止め、ログと通知で気づく
    console.error("注文の無い Session:", session.id, session.metadata);
    notify(`🚨 注文の見つからない決済 ${summary}\nSession: \`${session.id}\``);
    return text(200, "unresolvable session");
  }

  // 入金されずに終わった。状態だけ変える
  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const status =
      event.type === "checkout.session.expired" ? "expired" : "failed";
    // 決済画面を開いただけで閉じた注文(open)の失効はよくあることなので、知らせない
    if (markUnpaid(order.id, status) && order.status === "pending")
      notify(`❌ ${status === "expired" ? "失効" : "未入金で終了"} ${summary}`);
    return text(200, status);
  }

  if (!email) {
    console.error("メールアドレスの無い Session:", session.id);
    notify(`🚨 送り先の無い決済 ${summary}\nSession: \`${session.id}\``);
    return text(200, "unresolvable session");
  }

  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  if (!paid) {
    // コンビニ払い・銀行振込の注文。入金したら async_payment_succeeded でもう一度来る。
    // 管理画面で「入金待ち」として見えるように、ここで記録しておく
    if (event.type === "checkout.session.completed") {
      completeCheckout(order.id, {
        email,
        name: session.customer_details?.name ?? null,
        method,
        status: "pending",
        expiresAt: await paymentDeadline(session),
      });
      notify(`🕒 注文(入金待ち) ${summary}`);
    }
    return text(200, "not paid yet");
  }

  if (session.amount_total !== null && session.amount_total !== order.amount) {
    // こちらで作った明細どおりに決済画面を作るので、普通は合う(クーポンなどで変わりうる)
    console.warn("金額が注文と違います:", session.id, {
      order: order.amount,
      stripe: session.amount_total,
    });
  }
  completeCheckout(order.id, {
    email,
    name: session.customer_details?.name ?? null,
    method,
    status: "paid",
  });
  const current = getOrder(order.id) as Order;
  // 先に送る権利を取る。同時に届いた 2 通目はここで止まる
  if (!claimMail(current.id)) return text(200, "already delivered");

  // PUBLIC_URL があればそれ、無ければ Checkout を作ったときの origin(metadata)
  const origin = process.env.PUBLIC_URL?.trim()
    ? fallbackOrigin
    : session.metadata?.origin || fallbackOrigin;
  try {
    await deliver(current, origin, send);
  } catch (e) {
    releaseMail(current.id);
    console.error("注文のメールが送れませんでした:", session.id, e);
    notify(
      `⚠️ 決済完了、メール失敗 ${summary}\n${e instanceof Error ? e.message : String(e)}\nStripe が再送するので次の配信で送り直します`,
    );
    return text(500, "delivery failed");
  }
  notify(`💴 決済完了 ${summary}`);
  return text(200, "delivered");
}
