import Stripe from "stripe";

let instance: Stripe | undefined;

/**
 * Stripe の API の向き先。STRIPE_API_URL を入れると、そこ(stripe-mock や e2e の偽 Stripe)に向く。
 * 本番では入れない。
 */
function endpoint(): Stripe.StripeConfig {
  const raw = process.env.STRIPE_API_URL;
  if (!raw) return {};
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || (url.protocol === "http:" ? 80 : 443),
    protocol: url.protocol === "http:" ? "http" : "https",
  };
}

export default function stripe(): Stripe {
  if (instance) return instance;
  const key = process.env.STRIPE_SECRET_KEY;
  // SDK に空文字を渡すと「Neither apiKey nor config.authenticator provided」で
  // 落ちるが、それでは何を設定し忘れたのか分からない。
  if (!key) throw new Error("STRIPE_SECRET_KEY が設定されていません");
  instance = new Stripe(key, { timeout: 15000, ...endpoint() });
  return instance;
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
