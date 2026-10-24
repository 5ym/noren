/**
 * 商品の種類。
 *   download … 決済のあとファイルをメールで送る(ダウンロード販売)
 *   goods    … 会場で受け取る物販。サイズなどの種類(variant)を持てる
 *   ticket   … 入場チケット。受付で QR を見せて入る。種類(大人・子ども など)を持てる
 */
export type ProductKind = "download" | "goods" | "ticket";

export const KINDS: ProductKind[] = ["download", "goods", "ticket"];

export const KIND_LABELS: Record<ProductKind, string> = {
  download: "ダウンロード商品",
  goods: "会場で受け取り",
  ticket: "入場チケット",
};

export const isKind = (v: unknown): v is ProductKind =>
  typeof v === "string" && (KINDS as string[]).includes(v);

/** 会場で渡すもの(受け取り QR・入場 QR を出す)か */
export const handedOnSite = (kind: ProductKind) => kind !== "download";

/** 商品の種類(サイズ・色・大人/子ども など)。価格は商品単位。 */
export interface Variant {
  id: number;
  name: string;
  sortOrder: number;
}

/** 商品。サーバでもクライアントでも使う形(秘密は無い)。 */
export interface Product {
  /** URL とフォルダ名。作ったあとは変えられない */
  slug: string;
  /** 作ったあとは変えられない(送るファイルや受け取りの扱いが変わるため) */
  kind: ProductKind;
  name: string;
  /** 税込・円。0 なら決済を通さずに申し込みだけ受ける */
  price: number;
  /** 通常価格。price より高いときだけ取り消し線で出す */
  listPrice: number | null;
  description: string;
  /** exe 形式など、Windows パソコンでしか使えない商品(download だけ) */
  windowsOnly: boolean;
  /** 当日、会場で現金で払う予約を受け付ける(goods / ticket だけ) */
  payOnSite: boolean;
  /** false なら一覧に出さず、URL 直打ちでも 404 */
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** 一覧や商品ページに出す形。ファイルの有無はサーバでしか分からないので添える。 */
export interface ProductView extends Product {
  variants: Variant[];
  files: string[];
  /** 買える状態か。download はファイルが 1 つ以上あって active、ほかは active */
  available: boolean;
  /** 画像のファイル名(表示順)。実体は PRODUCTS_DIR/<slug>/images/。1 枚目が代表 */
  images: string[];
  /** 表示用。sanitize 済みの HTML(平文で入っている説明は段落に変換) */
  descriptionHtml: string;
  /** meta やカードの 1 行目など、タグ無しで欲しいとき */
  descriptionText: string;
}

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 1 つの商品(種類)で選べる数量の上限 */
export const MAX_COUNT = 99;

/** 画像 1 枚の URL。updatedAt を付けているので長くキャッシュしてよい */
export const imageUrlOf = (
  p: Pick<Product, "slug" | "updatedAt">,
  name: string,
) => `/products/${p.slug}/images/${encodeURIComponent(name)}?v=${p.updatedAt}`;

/** 代表画像(1 枚目)。無ければ null */
export const imageUrl = (
  p: Pick<ProductView, "slug" | "images" | "updatedAt">,
) => (p.images.length ? imageUrlOf(p, p.images[0]) : null);

/** 数量の入力欄の name。種類の無い商品は `qty`、種類ごとは `qty-<id>` */
export const qtyField = (variantId: number | null) =>
  variantId === null ? "qty" : `qty-${variantId}`;

/** 円の表示。Stripe の JPY は最小単位が円なので、金額はこのまま Stripe に渡る。 */
export const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/** 当日販売(複数の商品をまとめて売る)の数量の欄の name。`q:<slug>` か `q:<slug>:<種類の id>` */
export const counterField = (slug: string, variantId: number | null) =>
  variantId === null ? `q:${slug}` : `q:${slug}:${variantId}`;
