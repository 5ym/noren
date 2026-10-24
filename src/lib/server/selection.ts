import {
  counterField,
  MAX_COUNT,
  type ProductView,
  qtyField,
} from "../product";
import type { NewItem } from "./purchase";

/** 画面に返す、人が読む失敗。 */
export class SelectionError extends Error {}

function count(raw: FormDataEntryValue | null, fallback: number): number {
  if (raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT)
    throw new SelectionError(`数量は 0〜${MAX_COUNT} で入れてください`);
  return n;
}

const line = (
  p: ProductView,
  variant: { id: number; name: string } | null,
  n: number,
): NewItem => ({
  productSlug: p.slug,
  productName: p.name,
  kind: p.kind,
  variantId: variant?.id ?? null,
  variantName: variant?.name ?? null,
  price: p.price,
  count: n,
});

/**
 * 商品ページのフォームの数量を明細にする。価格は商品の今の値段。
 * ダウンロード商品は 1 点だけ。種類の無い商品は `qty`(無ければ 1)、種類のある商品は
 * `qty-<種類の id>` を全部読む。合わせて 1 つも無ければ断る。
 */
export function itemsFromProductForm(
  form: FormData,
  p: ProductView,
): NewItem[] {
  if (p.kind === "download") return [line(p, null, 1)];
  const items =
    p.variants.length === 0
      ? [line(p, null, count(form.get(qtyField(null)), 1))]
      : p.variants.map((v) => line(p, v, count(form.get(qtyField(v.id)), 0)));
  const picked = items.filter((i) => i.count > 0);
  if (picked.length === 0) throw new SelectionError("数量を選んでください");
  return picked;
}

/**
 * 当日販売の画面(複数の商品をまとめて売る)の数量を明細にする。
 * 会場で売るのは物販とチケットだけ(ダウンロード商品は送り先が要るので Checkout から)。
 */
export function itemsFromCounterForm(
  form: FormData,
  products: ProductView[],
): NewItem[] {
  const items: NewItem[] = [];
  for (const p of products) {
    if (p.kind === "download" || !p.active) continue;
    if (p.variants.length === 0) {
      const n = count(form.get(counterField(p.slug, null)), 0);
      if (n > 0) items.push(line(p, null, n));
    } else {
      for (const v of p.variants) {
        const n = count(form.get(counterField(p.slug, v.id)), 0);
        if (n > 0) items.push(line(p, v, n));
      }
    }
  }
  if (items.length === 0)
    throw new SelectionError("商品を 1 つ以上選んでください");
  return items;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 予約・申し込みのフォームの連絡先。メールは必須、名前は受付で呼ぶので必須 */
export function contactFromForm(form: FormData): {
  email: string;
  name: string;
} {
  const email = String(form.get("email") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!EMAIL.test(email) || email.length > 200)
    throw new SelectionError("メールアドレスを入れてください");
  if (!name || name.length > 100)
    throw new SelectionError("お名前を 100 文字以内で入れてください");
  return { email, name };
}
