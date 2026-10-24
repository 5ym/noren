import { handleWebhook } from "#lib/server/webhook.js";

import type { RequestHandler } from "./$types";

/**
 * Stripe ダッシュボードの Webhook 先。checkout.session.completed と
 * checkout.session.async_payment_succeeded を送るように設定する(README)。
 */
export const POST: RequestHandler = async ({ request, url }) => {
  // 署名は生のボディに対して付いているので、パースする前の文字列のまま渡す
  const body = await request.text();
  return handleWebhook(
    body,
    request.headers.get("stripe-signature"),
    url.origin,
  );
};
