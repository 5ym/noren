import { awaitingHand, recentlyHanded } from "#lib/server/purchase.js";

import type { PageServerLoad } from "./$types";

/** 受け取り待ち(物販)・入場前(チケット)の一覧と、最近渡したもの */
export const load: PageServerLoad = ({ url }) => {
  const kind = url.searchParams.get("kind") === "ticket" ? "ticket" : "goods";
  const waiting = awaitingHand(kind);
  return {
    kind,
    waiting,
    recent: recentlyHanded(kind),
    // 当日払いで、まだ受け取っていない代金の合計
    cashDue: waiting
      .filter((o) => o.status === "unpaid")
      .reduce((s, o) => s + o.amount, 0),
  };
};
