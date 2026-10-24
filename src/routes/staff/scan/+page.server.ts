import { fail, redirect } from "@sveltejs/kit";

import { codeFromScan } from "#lib/order.js";
import { orderByCode } from "#lib/server/purchase.js";

import type { Actions } from "./$types";

export const actions: Actions = {
  // QR が読めないときに、客が見せた番号(か QR の URL)を打って開く
  default: async ({ request }) => {
    const form = await request.formData();
    const code = codeFromScan(String(form.get("code") ?? ""));
    if (!code || !orderByCode(code))
      return fail(404, { error: "その番号の注文はありません" });
    redirect(303, `/staff/o/${code}`);
  },
};
