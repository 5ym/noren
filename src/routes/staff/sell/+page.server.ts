import { fail, redirect } from "@sveltejs/kit";

import { listProducts } from "#lib/server/products.js";
import { createOrder } from "#lib/server/purchase.js";
import { itemsFromCounterForm, SelectionError } from "#lib/server/selection.js";
import { squareUrl } from "#lib/server/square.js";

import type { Actions, PageServerLoad } from "./$types";

/** 会場で売るもの。物販とチケットだけ(ダウンロード商品は送り先が要るので Checkout から) */
const sellable = () => listProducts().filter((p) => p.kind !== "download");

const square = () => process.env.SQUARE_APPLICATION_ID || "";

export const load: PageServerLoad = () => ({
  products: sellable(),
  square: Boolean(square()),
});

export const actions: Actions = {
  // 現金。受けたその場で支払い済み・受け渡し済みとして記録する
  cash: async ({ request, locals }) => {
    const form = await request.formData();
    let code: string;
    try {
      const items = itemsFromCounterForm(form, sellable());
      code = createOrder({
        channel: "counter",
        method: "cash",
        status: "paid",
        items,
        handedBy: locals.user?.name ?? "",
      }).code;
    } catch (e) {
      if (e instanceof SelectionError) return fail(400, { error: e.message });
      throw e;
    }
    redirect(303, `/staff/o/${code}?sold=1`);
  },
  // Square。会計待ちで記録し、Square POS を開く。戻ってきたら /staff/square で済ませる
  square: async ({ request, url }) => {
    const applicationId = square();
    if (!applicationId)
      return fail(400, { error: "Square が設定されていません" });
    const form = await request.formData();
    try {
      const items = itemsFromCounterForm(form, sellable());
      const order = createOrder({
        channel: "counter",
        method: "square",
        status: "pending",
        items,
      });
      const callback =
        process.env.SQUARE_CALLBACK_URL || `${url.origin}/staff/square`;
      return {
        square: squareUrl(order.code, order.amount, applicationId, callback),
        amount: order.amount,
      };
    } catch (e) {
      if (e instanceof SelectionError) return fail(400, { error: e.message });
      throw e;
    }
  },
};
