import type { ProductKind } from "./product";

/**
 * 注文の状態。
 *   open    … Checkout の決済画面を開いたところ(まだ払っていない)
 *   pending … 入金待ち(コンビニ払い・銀行振込、Square の会計待ち)
 *   unpaid  … 当日払いの予約。会場で現金を受けたら paid になる
 *   paid    … 支払い済み(無料の申し込みも含む)
 *   failed  … 入金されずに終わった(コンビニの払込期限切れなど)
 *   expired … 決済画面のまま失効した
 */
export type OrderStatus =
  "open" | "pending" | "unpaid" | "paid" | "failed" | "expired";

/** cls は app.css の .tag に足す修飾子。空なら灰色の札 */
export const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  open: { label: "決済前", cls: "" },
  pending: { label: "入金待ち", cls: "warn" },
  unpaid: { label: "当日払い・未払い", cls: "warn" },
  paid: { label: "支払い済み", cls: "ok" },
  failed: { label: "未入金で終了", cls: "" },
  expired: { label: "失効", cls: "" },
};

/** online … 客が自分で買った(Checkout・予約)。counter … スタッフが会場で売った */
export type Channel = "online" | "counter";

/**
 * 支払い方法。Stripe のもの(card / konbini / customer_balance …)は
 * payment_method_types[0] をそのまま入れるので、ここに無い値も来る。
 */
export const METHOD: Record<string, string> = {
  stripe: "Stripe",
  card: "カード",
  konbini: "コンビニ",
  customer_balance: "銀行振込",
  link: "Link",
  paypay: "PayPay",
  cash: "現金",
  square: "Square",
  free: "無料",
};

export const methodLabel = (m: string) => METHOD[m] ?? m;

/** 注文の 1 行。商品名と種類名は注文したときのものを写して持つ(あとで消されても読める) */
export interface OrderItem {
  id: number;
  productSlug: string;
  productName: string;
  kind: ProductKind;
  variantId: number | null;
  variantName: string | null;
  price: number;
  count: number;
}

export interface Order {
  id: number;
  /** 客に送るリンクの鍵(`/orders/<token>`)。知っている人だけが注文を見られる */
  token: string;
  /** 受け取り・入場の QR に入れる番号。スタッフが読む */
  code: string;
  channel: Channel;
  method: string;
  status: OrderStatus;
  sessionId: string | null;
  email: string | null;
  name: string | null;
  amount: number;
  createdAt: number;
  paidAt: number | null;
  /** 支払い期限(ms)。コンビニ払いで分かるときだけ */
  expiresAt: number | null;
  mailedAt: number | null;
  /** 会場で渡した(物販は受け取り、チケットは入場)とき */
  handedAt: number | null;
  handedBy: string | null;
  items: OrderItem[];
}

export const itemLabel = (i: Pick<OrderItem, "productName" | "variantName">) =>
  i.variantName ? `${i.productName}(${i.variantName})` : i.productName;

/** 会場で渡すもの(物販・チケット)が入っているか */
export const needsHanding = (o: Pick<Order, "items">) =>
  o.items.some((i) => i.kind !== "download");

/** 中身がチケットだけなら「入場」、それ以外は「受け取り」 */
export const handWord = (o: Pick<Order, "items">) =>
  o.items.length > 0 && o.items.every((i) => i.kind === "ticket")
    ? "入場"
    : "受け取り";

/** QR を読んだ文字列から注文の番号を取り出す。URL(`/staff/o/<code>`)でも番号だけでもよい */
export function codeFromScan(text: string): string | null {
  const t = text.trim();
  if (CODE.test(t)) return t;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  const m = /^\/staff\/o\/([A-Za-z0-9]+)$/.exec(url.pathname);
  return m && CODE.test(m[1]) ? m[1] : null;
}

/** 受け取り・入場の番号の形。紛らわしい文字(0O1Il)を除いた 12 文字 */
export const CODE = /^[A-HJ-NP-Za-km-z2-9]{12}$/;
