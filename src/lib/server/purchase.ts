import type { Channel, Order, OrderItem, OrderStatus } from "../order";
import type { ProductKind } from "../product";
import db from "./db";
import { randomCode, randomToken } from "./random";

type Row = Omit<Order, "items">;

const ORDER_COLS =
  "id, token, code, channel, method, status, sessionId, email, name, amount, createdAt, paidAt, expiresAt, mailedAt, handedAt, handedBy";

/** 注文に明細を付ける(まとめて 1 回で引く) */
function withItems(rows: Row[]): Order[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const items = db()
    .query<OrderItem & { purchaseId: number }, number[]>(
      `SELECT id, purchaseId, productSlug, productName, kind, variantId, variantName, price, count
			 FROM purchase_item WHERE purchaseId IN (${ids.map(() => "?").join(", ")}) ORDER BY id`,
    )
    .all(...ids);
  return rows.map((r) => ({
    ...r,
    items: items
      .filter((i) => i.purchaseId === r.id)
      .map((i) => ({
        id: i.id,
        productSlug: i.productSlug,
        productName: i.productName,
        kind: i.kind,
        variantId: i.variantId,
        variantName: i.variantName,
        price: i.price,
        count: i.count,
      })),
  }));
}

const one = (where: string, value: string | number): Order | null => {
  const row = db()
    .query<Row, [string | number]>(
      `SELECT ${ORDER_COLS} FROM purchase WHERE ${where} = ?`,
    )
    .get(value);
  return row ? withItems([row])[0] : null;
};

export const getOrder = (id: number) => one("id", id);
export const orderByToken = (token: string) => one("token", token);
export const orderByCode = (code: string) => one("code", code);
export const orderBySession = (sessionId: string) =>
  one("sessionId", sessionId);

/** 明細 1 行の入力。価格は呼ぶ側が商品の今の値段を確かめて入れる */
export interface NewItem {
  productSlug: string;
  productName: string;
  kind: ProductKind;
  variantId: number | null;
  variantName: string | null;
  price: number;
  count: number;
}

export function createOrder(input: {
  channel: Channel;
  method: string;
  status: OrderStatus;
  email?: string | null;
  name?: string | null;
  items: NewItem[];
  /** 作った時点で支払い済み・受け渡し済みにする(会場の現金売り) */
  handedBy?: string;
}): Order {
  if (input.items.length === 0) throw new Error("明細の無い注文は作れません");
  const now = Date.now();
  const amount = input.items.reduce((s, i) => s + i.price * i.count, 0);
  const id = db().transaction(() => {
    const row = db()
      .query<{ id: number }, (string | number | null)[]>(
        `INSERT INTO purchase (token, code, channel, method, status, email, name, amount, createdAt, paidAt, handedAt, handedBy)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        randomToken(),
        randomCode(),
        input.channel,
        input.method,
        input.status,
        input.email ?? null,
        input.name ?? null,
        amount,
        now,
        input.status === "paid" ? now : null,
        input.handedBy === undefined ? null : now,
        input.handedBy ?? null,
      );
    if (!row) throw new Error("注文を記録できませんでした");
    for (const i of input.items) {
      db().run(
        `INSERT INTO purchase_item (purchaseId, productSlug, productName, kind, variantId, variantName, price, count)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          i.productSlug,
          i.productName,
          i.kind,
          i.variantId,
          i.variantName,
          i.price,
          i.count,
        ],
      );
    }
    return row.id;
  })();
  return getOrder(id) as Order;
}

/** Checkout の Session を作ったら結び付ける(Webhook が引けるように) */
export function attachSession(id: number, sessionId: string): void {
  db().run("UPDATE purchase SET sessionId = ? WHERE id = ?", [sessionId, id]);
}

/**
 * Checkout が終わった(completed)。払った人の連絡先と方法を写し、状態を進める。
 * 支払い済み・終わった注文を入金待ちに戻すことは無い(Stripe は順番どおりに送ってこないことがある)。
 */
export function completeCheckout(
  id: number,
  input: {
    email: string;
    name: string | null;
    method: string | null;
    status: "pending" | "paid";
    expiresAt?: number | null;
  },
): void {
  db().run(
    `UPDATE purchase SET email = ?, name = ?, method = COALESCE(?, method), expiresAt = COALESCE(?, expiresAt),
		 status = CASE WHEN status IN ('open', 'pending') THEN ? ELSE status END,
		 paidAt = CASE WHEN ? = 'paid' AND paidAt IS NULL THEN ? ELSE paidAt END
		 WHERE id = ?`,
    [
      input.email,
      input.name,
      input.method,
      input.expiresAt ?? null,
      input.status,
      input.status,
      Date.now(),
      id,
    ],
  );
}

export function markMailed(id: number): void {
  db().run("UPDATE purchase SET mailedAt = ? WHERE id = ?", [Date.now(), id]);
}

/**
 * 入金されずに終わった / 失効した。まだ払われていない注文だけ変える
 * (Stripe の expired が paid のあとに来ることは無いが、念のため)。
 */
export function markUnpaid(id: number, status: "failed" | "expired"): boolean {
  const r = db().run(
    "UPDATE purchase SET status = ? WHERE id = ? AND status IN ('open', 'pending')",
    [status, id],
  );
  return r.changes > 0;
}

/**
 * 会場で渡した(受け取り・入場)。`collect` は当日払いの代金を受けたことも一緒に記録する。
 * まだ渡していない注文だけを書き換え、書き換えたかを返す(2 台で同時に読んでも片方だけが通る)。
 */
export function hand(id: number, by: string, collect = false): boolean {
  const now = Date.now();
  const r = collect
    ? db().run(
        `UPDATE purchase SET handedAt = ?, handedBy = ?, status = 'paid', paidAt = ?
				 WHERE id = ? AND handedAt IS NULL AND status = 'unpaid'`,
        [now, by, now, id],
      )
    : db().run(
        `UPDATE purchase SET handedAt = ?, handedBy = ?
				 WHERE id = ? AND handedAt IS NULL AND status = 'paid'`,
        [now, by, id],
      );
  return r.changes > 0;
}

/** 渡したのを取り消す(読み違えたとき)。受けた代金はそのまま */
export function unhand(id: number): boolean {
  return (
    db().run(
      "UPDATE purchase SET handedAt = NULL, handedBy = NULL WHERE id = ? AND handedAt IS NOT NULL",
      [id],
    ).changes > 0
  );
}

/** Square で会計が済んだ(当日販売)。会計待ちのものだけ */
export function settleSquare(id: number, by: string): boolean {
  const now = Date.now();
  return (
    db().run(
      `UPDATE purchase SET status = 'paid', paidAt = ?, handedAt = ?, handedBy = ?
			 WHERE id = ? AND channel = 'counter' AND method = 'square' AND status = 'pending'`,
      [now, now, by, id],
    ).changes > 0
  );
}

const many = (sql: string, ...params: (string | number)[]) =>
  withItems(
    db()
      .query<Row, (string | number)[]>(sql)
      .all(...params),
  );

/**
 * 管理画面の注文一覧。決済画面を開いただけのもの(open と、そのまま失効したもの。
 * Checkout を終えていないので連絡先が無い)は出さない。入金待ちを先に、あとは新しい順
 */
export const listOrders = (limit = 300) =>
  many(
    `SELECT ${ORDER_COLS} FROM purchase
		 WHERE status != 'open' AND (channel = 'counter' OR email IS NOT NULL)
		 ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, createdAt DESC LIMIT ?`,
    limit,
  );

export function countPending(): number {
  return (
    db()
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM purchase WHERE status = 'pending' AND channel = 'online'",
      )
      .get()?.n ?? 0
  );
}

/** これから会場で渡す注文(支払い済みか当日払い)。kind の明細を含むもの、古い順 */
export const awaitingHand = (kind: "goods" | "ticket") =>
  many(
    `SELECT ${ORDER_COLS} FROM purchase p WHERE handedAt IS NULL AND status IN ('paid', 'unpaid')
		 AND EXISTS (SELECT 1 FROM purchase_item i WHERE i.purchaseId = p.id AND i.kind = ?)
		 ORDER BY createdAt`,
    kind,
  );

/** 最近渡した注文。kind の明細を含むもの、新しい順 */
export const recentlyHanded = (kind: "goods" | "ticket", limit = 20) =>
  many(
    `SELECT ${ORDER_COLS} FROM purchase p WHERE handedAt IS NOT NULL
		 AND EXISTS (SELECT 1 FROM purchase_item i WHERE i.purchaseId = p.id AND i.kind = ?)
		 ORDER BY handedAt DESC LIMIT ?`,
    kind,
    limit,
  );
