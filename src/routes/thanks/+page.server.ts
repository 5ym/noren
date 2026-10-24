import { error } from "@sveltejs/kit";

import { orderBySession } from "#lib/server/purchase.js";
import stripe from "#lib/server/stripe.js";

import type { PageServerLoad } from "./$types";

// Stripe が success_url に埋めてくる ID。形が違うものは Stripe に聞く前に落とす。
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  const id = url.searchParams.get("session_id") ?? "";
  if (!SESSION_ID.test(id)) error(404, "決済が見つかりません");
  const session = await stripe()
    .checkout.sessions.retrieve(id)
    .catch(() => undefined);
  if (!session) error(404, "決済が見つかりません");
  // 注文ページの鍵を載せるので、この画面から外へ URL を漏らさない
  setHeaders({ "referrer-policy": "no-referrer", "cache-control": "no-store" });
  const order = orderBySession(session.id);
  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  return {
    // カードは即 paid。コンビニ払いや銀行振込は入金まで unpaid のままなので、
    // 「メールを送った」とは言わない。
    paid,
    email: session.customer_details?.email ?? null,
    // Webhook が先に届いていれば、注文ページへそのまま進める
    token: paid && order?.status === "paid" ? order.token : null,
  };
};
