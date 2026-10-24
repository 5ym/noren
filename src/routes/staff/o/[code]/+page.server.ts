import { error, fail } from "@sveltejs/kit";

import { CODE, handWord, needsHanding } from "#lib/order.js";
import { getOrder, hand, orderByCode, unhand } from "#lib/server/purchase.js";

import type { Actions, PageServerLoad } from "./$types";

/**
 * QR を読んだ先(スタッフ)。注文の中身と状態を出し、受け取り・入場を記録する。
 * 当日払いの未払いは、代金を受けて渡したことを一度に記録する。
 */
export const load: PageServerLoad = ({ params, url }) => {
  if (!CODE.test(params.code)) error(404, "注文が見つかりません");
  const order = orderByCode(params.code);
  if (!order) error(404, "注文が見つかりません");
  return { order, sold: url.searchParams.has("sold") };
};

const find = (code: string) => {
  const order = CODE.test(code) ? orderByCode(code) : null;
  if (!order) error(404, "注文が見つかりません");
  return order;
};

/** 渡す。collect は当日払いの代金を受けたことも記録する */
function handOver(code: string, by: string, collect: boolean) {
  const order = find(code);
  const word = handWord(order);
  if (!needsHanding(order))
    return fail(400, { error: "会場で渡すものが入っていない注文です" });
  if (order.handedAt !== null)
    return fail(409, { error: `${word}済みの注文です` });
  if (collect && order.status !== "unpaid")
    return fail(400, { error: "当日払いの未払いの注文ではありません" });
  if (!collect && order.status !== "paid")
    return fail(400, { error: "支払いが済んでいない注文です" });
  // 2 台で同時に読んだときは片方だけが通る
  if (!hand(order.id, by, collect))
    return fail(409, { error: `${word}済みの注文です` });
  return { done: getOrder(order.id)?.handedAt ?? Date.now() };
}

export const actions: Actions = {
  hand: ({ params, locals }) =>
    handOver(params.code, locals.user?.name ?? "", false),
  collect: ({ params, locals }) =>
    handOver(params.code, locals.user?.name ?? "", true),
  // 読み違えたとき。受けた代金はそのまま
  undo: ({ params }) => {
    const order = find(params.code);
    if (!unhand(order.id)) return fail(409, { error: "まだ渡していません" });
    return { undone: true };
  },
};
