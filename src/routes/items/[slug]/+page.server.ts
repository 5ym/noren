import { error, fail, redirect } from "@sveltejs/kit";

import { reserve, startCheckout } from "#lib/server/checkout.js";
import { getProduct, listProducts } from "#lib/server/products.js";
import {
  contactFromForm,
  itemsFromProductForm,
  SelectionError,
} from "#lib/server/selection.js";
import { stripeConfigured } from "#lib/server/stripe.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
  const product = getProduct(params.slug);
  if (!product?.active) error(404, "商品が見つかりません");
  // 他の商品。一覧に戻らずに次を見られるように、最大 4 つ
  const others = listProducts()
    .filter((p) => p.slug !== product.slug)
    .slice(0, 4);
  return { product, others, card: stripeConfigured() };
};

/** フォームの値を戻す(数量と連絡先を打ち直させない) */
const keep = (form: FormData) =>
  Object.fromEntries(
    [...form.entries()].filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );

export const actions: Actions = {
  // 「購入する」。Stripe Checkout の Session を作ってそこへ飛ばす。カート無し、1 商品ずつ。
  checkout: async ({ params, request, url }) => {
    const product = getProduct(params.slug);
    if (!product?.active) error(404, "商品が見つかりません");
    if (!product.available) error(409, "この商品は準備中です");
    if (product.price === 0) error(400, "無料の商品は申し込みから");
    const form = await request.formData();
    let target: string;
    try {
      const items = itemsFromProductForm(form, product);
      target = await startCheckout(product, items, url.origin);
    } catch (e) {
      if (e instanceof SelectionError)
        return fail(400, { error: e.message, values: keep(form) });
      throw e;
    }
    redirect(303, target, { external: true });
  },
  // 当日払いの予約と、無料の申し込み。連絡先をここで聞き、注文ページへ進む
  reserve: async ({ params, request, url }) => {
    const product = getProduct(params.slug);
    if (!product?.active) error(404, "商品が見つかりません");
    if (!product.available) error(409, "この商品は準備中です");
    const form = await request.formData();
    let token: string;
    try {
      const items = itemsFromProductForm(form, product);
      const contact = contactFromForm(form);
      token = (await reserve(product, items, contact, url.origin)).token;
    } catch (e) {
      if (e instanceof SelectionError)
        return fail(400, {
          error: e.message,
          values: keep(form),
          reserving: true,
        });
      throw e;
    }
    redirect(303, `/orders/${token}?new=1`);
  },
};
