import { CODE } from "#lib/order.js";
import { orderByCode, settleSquare } from "#lib/server/purchase.js";

import type { PageServerLoad } from "./$types";

/**
 * Square POS が会計のあと戻ってくるところ。成功すると CLIENT_TRANSACTION_ID が付くので、
 * REQUEST_METADATA の番号の会計待ち(当日販売の square)を支払い済み・受け渡し済みにする。
 * ほかの注文の番号を渡されても、Square の会計と結び付かないので触らない。
 */
export const load: PageServerLoad = ({ url, locals }) => {
  const q = url.searchParams;
  const transactionId = q.get("com.squareup.pos.CLIENT_TRANSACTION_ID");
  const code = q.get("com.squareup.pos.REQUEST_METADATA") ?? "";
  if (!transactionId) {
    return {
      ok: false as const,
      message:
        q.get("com.squareup.pos.ERROR_DESCRIPTION") ?? "会計が取り消されました",
      code: null,
    };
  }
  const order = CODE.test(code) ? orderByCode(code) : null;
  if (!order || order.channel !== "counter" || order.method !== "square") {
    return {
      ok: false as const,
      message: "この会計の注文が見つかりません",
      code: null,
    };
  }
  // 戻りが 2 度来ても(再読み込み)、済んでいれば何もしない
  settleSquare(order.id, locals.user?.name ?? "");
  return { ok: true as const, message: "", code: order.code };
};
