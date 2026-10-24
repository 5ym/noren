import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import {
  isKind,
  type Product,
  type ProductKind,
  type ProductView,
  SLUG,
  type Variant,
} from "../product";
import {
  descriptionHtml,
  descriptionText,
  isHtml,
  sanitizeHtml,
} from "../richtext";
import db from "./db";

/** 管理画面に返す、人が読む失敗。 */
export class ProductError extends Error {}

/** ファイルを置く場所。本番はボリューム、手元は data/products、テストは一時ディレクトリ。 */
export const productsDir = () => process.env.PRODUCTS_DIR || "data/products";
const dirOf = (slug: string) => join(productsDir(), slug);
/** 決済後に送るファイル。このフォルダにあるものを全部送る(download だけ) */
const filesDirOf = (slug: string) => join(dirOf(slug), "files");
export const filePath = (slug: string, file: string) =>
  join(filesDirOf(slug), file);
/** 画像の置き場。NN.ext の名前で、並びはファイル名。1 枚目が代表 */
const imagesDirOf = (slug: string) => join(dirOf(slug), "images");
export const imagePathOf = (slug: string, name: string) =>
  join(imagesDirOf(slug), name);

interface Row extends Omit<
  Product,
  "kind" | "windowsOnly" | "payOnSite" | "active"
> {
  kind: string;
  windowsOnly: number;
  payOnSite: number;
  active: number;
}

const fromRow = (r: Row): Product => ({
  ...r,
  kind: isKind(r.kind) ? r.kind : "download",
  windowsOnly: r.windowsOnly === 1,
  payOnSite: r.payOnSite === 1,
  active: r.active === 1,
});

export function listFiles(slug: string): string[] {
  try {
    return readdirSync(filesDirOf(slug))
      .filter(
        (f) =>
          !f.endsWith(".uploading") && statSync(filePath(slug, f)).isFile(),
      )
      .sort();
  } catch {
    return [];
  }
}

export function listVariants(slug: string): Variant[] {
  return db()
    .query<Variant, [string]>(
      "SELECT id, name, sortOrder FROM variant WHERE productSlug = ? ORDER BY sortOrder, id",
    )
    .all(slug);
}

const view = (p: Product): ProductView => {
  const files = p.kind === "download" ? listFiles(p.slug) : [];
  return {
    ...p,
    variants: p.kind === "download" ? [] : listVariants(p.slug),
    files,
    images: listImages(p.slug),
    available: p.active && (p.kind !== "download" || files.length > 0),
    descriptionHtml: descriptionHtml(p.description),
    descriptionText: descriptionText(p.description),
  };
};

export function listProducts(all = false): ProductView[] {
  const rows = db()
    .query<Row, []>(
      `SELECT * FROM product ${all ? "" : "WHERE active = 1"} ORDER BY sortOrder, createdAt`,
    )
    .all();
  return rows.map((r) => view(fromRow(r)));
}

export function getProduct(slug: string): ProductView | null {
  const row = db()
    .query<Row, [string]>("SELECT * FROM product WHERE slug = ?")
    .get(slug);
  return row ? view(fromRow(row)) : null;
}

function parsePrice(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10_000_000) {
    throw new ProductError(`${label}は 0 以上の整数(円)で入れてください`);
  }
  return n;
}

export function createProduct(input: {
  slug: unknown;
  name: unknown;
  price: unknown;
  kind?: unknown;
}): ProductView {
  const slug = String(input.slug ?? "").trim();
  if (!SLUG.test(slug)) {
    throw new ProductError(
      "slug は英小文字・数字・ハイフンで、先頭は英数字にしてください",
    );
  }
  const name = String(input.name ?? "").trim();
  if (!name) throw new ProductError("商品名を入れてください");
  const price = parsePrice(input.price, "価格");
  const kind = input.kind ?? "download";
  if (!isKind(kind)) throw new ProductError("商品の種類を選んでください");
  if (getProduct(slug)) throw new ProductError(`${slug} はもうあります`);
  const now = Date.now();
  const sortOrder =
    (db().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM product").get()
      ?.n ?? 0) + 1;
  db().run(
    "INSERT INTO product (slug, kind, name, price, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [slug, kind, name, price, sortOrder, now, now],
  );
  if (kind === "download") mkdirSync(filesDirOf(slug), { recursive: true });
  return getProduct(slug) as ProductView;
}

/**
 * 管理画面の Tiptap は HTML を出す。入口で sanitize しておくと、DB の中身を
 * そのまま信じてよくなる(表示側でももう一度通すので二重だが、安いので構わない)。
 * 平文(テストやシードの説明)はそのまま。
 */
function normalizeDescription(value: unknown): string {
  const s = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  return isHtml(s) ? sanitizeHtml(s) : s;
}

export function updateProduct(
  slug: string,
  input: {
    name: unknown;
    price: unknown;
    listPrice: unknown;
    description: unknown;
    windowsOnly: unknown;
    payOnSite: unknown;
    active: unknown;
    sortOrder: unknown;
  },
): ProductView {
  const current = getProduct(slug);
  if (!current) throw new ProductError("商品が見つかりません");
  const name = String(input.name ?? "").trim();
  if (!name) throw new ProductError("商品名を入れてください");
  const price = parsePrice(input.price, "価格");
  const listRaw = String(input.listPrice ?? "").trim();
  const listPrice = listRaw === "" ? null : parsePrice(listRaw, "通常価格");
  const sortOrder = parsePrice(input.sortOrder || 0, "並び順");
  const isDownload = current.kind === "download";
  db().run(
    `UPDATE product SET name = ?, price = ?, listPrice = ?, description = ?, windowsOnly = ?,
		 payOnSite = ?, active = ?, sortOrder = ?, updatedAt = ? WHERE slug = ?`,
    [
      name,
      price,
      listPrice,
      normalizeDescription(input.description),
      // 種類に関係の無い札は落とす(画面に出していなくても、送られてきたら無視する)
      isDownload && input.windowsOnly ? 1 : 0,
      !isDownload && input.payOnSite ? 1 : 0,
      input.active ? 1 : 0,
      sortOrder,
      Date.now(),
      slug,
    ],
  );
  return getProduct(slug) as ProductView;
}

/** 行もフォルダも消す。売った履歴(purchase)は明細に名前を写してあるので残る。 */
export function deleteProduct(slug: string): void {
  db().run("DELETE FROM product WHERE slug = ?", [slug]);
  rmSync(dirOf(slug), { recursive: true, force: true });
}

// ---- 種類(サイズなど) -------------------------------------------------------------

const MAX_VARIANTS = 30;

function variantName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name) throw new ProductError("種類の名前を入れてください");
  if (name.length > 40)
    throw new ProductError("種類の名前は 40 文字までにしてください");
  return name;
}

function requireVariantable(slug: string): ProductView {
  const p = getProduct(slug);
  if (!p) throw new ProductError("商品が見つかりません");
  if (p.kind === "download")
    throw new ProductError("ダウンロード商品には種類を付けられません");
  return p;
}

/** 末尾に足す。複数行なら 1 行 1 つ */
export function addVariants(slug: string, text: unknown): void {
  const p = requireVariantable(slug);
  const names = String(text ?? "")
    .split(/\r?\n|,|、/)
    .map((s) => s.trim())
    .filter((s) => s);
  if (names.length === 0) throw new ProductError("種類の名前を入れてください");
  if (p.variants.length + names.length > MAX_VARIANTS)
    throw new ProductError(`種類は ${MAX_VARIANTS} 個までです`);
  let order = p.variants.reduce((m, v) => Math.max(m, v.sortOrder), 0);
  db().transaction(() => {
    for (const n of names) {
      db().run(
        "INSERT INTO variant (productSlug, name, sortOrder) VALUES (?, ?, ?)",
        [slug, variantName(n), ++order],
      );
    }
  })();
  touch(slug);
}

const variantOf = (slug: string, id: unknown) => {
  const p = requireVariantable(slug);
  const v = p.variants.find((x) => x.id === Number(id));
  if (!v) throw new ProductError("その種類はありません");
  return { p, v };
};

export function renameVariant(slug: string, id: unknown, name: unknown): void {
  const { v } = variantOf(slug, id);
  db().run("UPDATE variant SET name = ? WHERE id = ?", [
    variantName(name),
    v.id,
  ]);
  touch(slug);
}

/** 消しても注文の明細には名前が写してあるので困らない */
export function removeVariant(slug: string, id: unknown): void {
  const { v } = variantOf(slug, id);
  db().run("DELETE FROM variant WHERE id = ?", [v.id]);
  touch(slug);
}

/** 1 つ前後に動かす。並びは振り直す */
export function moveVariant(slug: string, id: unknown, dir: -1 | 1): void {
  const { p, v } = variantOf(slug, id);
  const list = [...p.variants];
  const i = list.findIndex((x) => x.id === v.id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  db().transaction(() => {
    list.forEach((x, k) => {
      db().run("UPDATE variant SET sortOrder = ? WHERE id = ?", [k + 1, x.id]);
    });
  })();
  touch(slug);
}

// ---- 送るファイル(download) --------------------------------------------------------

/** アップロードされたファイル名を、フォルダの中に収まる 1 つの名前にする。 */
export function safeFileName(name: string): string {
  const base = basename(name.replace(/\\/g, "/")).trim();
  if (
    !base ||
    base === "." ||
    base === ".." ||
    base.startsWith(".") ||
    base.endsWith(".uploading") ||
    base.length > 200
  ) {
    throw new ProductError("そのファイル名は使えません");
  }
  return base;
}

/** ストリームのままディスクに落とす。数百 MB のファイルをメモリに載せない。 */
export async function saveFile(
  slug: string,
  name: string,
  body: ReadableStream<Uint8Array> | Blob,
): Promise<void> {
  const p = getProduct(slug);
  if (!p) throw new ProductError("商品が見つかりません");
  if (p.kind !== "download")
    throw new ProductError("ファイルを送るのはダウンロード商品だけです");
  mkdirSync(filesDirOf(slug), { recursive: true });
  const path = filePath(slug, safeFileName(name));
  // 途中で切れた半端なファイルを売り物にしない: 別名に書いて、終わってから差し替える
  const tmp = `${path}.uploading`;
  try {
    // Bun.write(tmp, new Response(stream)) はリクエストの ReadableStream を最後まで
    // 読まずに止まることがあった。チャンクを順に FileSink へ書くのが確実
    const sink = Bun.file(tmp).writer();
    try {
      const chunks =
        body instanceof Blob
          ? [new Uint8Array(await body.arrayBuffer())]
          : body;
      for await (const chunk of chunks) sink.write(chunk);
    } finally {
      await sink.end();
    }
    if (statSync(tmp).size === 0) throw new ProductError("空のファイルです");
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  touch(slug);
}

export function removeFile(slug: string, name: string): void {
  const path = filePath(slug, safeFileName(name));
  if (existsSync(path)) unlinkSync(path);
  touch(slug);
}

// ---- 画像 ----------------------------------------------------------------------

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const EXT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([t, e]) => [e, t]),
);
/** images/ の中で画像として扱う名前。NN.ext だけ */
const IMAGE_NAME = /^\d{2}\.(jpg|png|webp|gif|avif)$/;
const MAX_IMAGES = 12;

/** 配信のときの content-type。名前が形式に合わなければ null */
export function imageMime(name: string): string | null {
  const m = IMAGE_NAME.exec(name);
  return m ? EXT_TYPES[m[1]] : null;
}

/** 画像の一覧(表示順)。 */
export function listImages(slug: string): string[] {
  try {
    return readdirSync(imagesDirOf(slug))
      .filter(
        (f) => IMAGE_NAME.test(f) && statSync(imagePathOf(slug, f)).isFile(),
      )
      .sort();
  } catch {
    return [];
  }
}

/** 末尾に 1 枚足す。番号は今ある最大 + 1 */
export async function saveImage(slug: string, file: File): Promise<void> {
  if (!getProduct(slug)) throw new ProductError("商品が見つかりません");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new ProductError("画像は JPEG / PNG / WebP / GIF / AVIF で");
  if (file.size > 5 * 1024 * 1024)
    throw new ProductError("画像は 5MB までにしてください");
  if (file.size === 0) throw new ProductError("空のファイルです");
  const current = listImages(slug);
  if (current.length >= MAX_IMAGES)
    throw new ProductError(`画像は ${MAX_IMAGES} 枚までです`);
  const next = current.length
    ? Number(current[current.length - 1].slice(0, 2)) + 1
    : 1;
  if (next > 99) throw new ProductError("画像を整理してから足してください");
  mkdirSync(imagesDirOf(slug), { recursive: true });
  await Bun.write(
    imagePathOf(slug, `${String(next).padStart(2, "0")}.${ext}`),
    file,
  );
  touch(slug);
}

export function removeImage(slug: string, name: string): void {
  if (!IMAGE_NAME.test(name)) throw new ProductError("その画像はありません");
  rmSync(imagePathOf(slug, name), { force: true });
  touch(slug);
}

/**
 * 1 枚を前後に動かす。番号を付け直すので、他の画像の名前も変わる
 * (URL には updatedAt が付いているので、古い名前がキャッシュされていても困らない)。
 */
export function moveImage(slug: string, name: string, dir: -1 | 1): void {
  const names = listImages(slug);
  const i = names.indexOf(name);
  if (i < 0) throw new ProductError("その画像はありません");
  const j = i + dir;
  if (j < 0 || j >= names.length) return;
  [names[i], names[j]] = [names[j], names[i]];
  // 一度 tmp を挟む: 01 → 02 と 02 → 01 を直接やると片方が消える
  const tmps = names.map((n, k) => {
    const tmp = imagePathOf(slug, `tmp-${k}-${n}`);
    renameSync(imagePathOf(slug, n), tmp);
    return tmp;
  });
  tmps.forEach((tmp, k) => {
    const ext = names[k].slice(3);
    renameSync(
      tmp,
      imagePathOf(slug, `${String(k + 1).padStart(2, "0")}.${ext}`),
    );
  });
  touch(slug);
}

const touch = (slug: string) =>
  db().run("UPDATE product SET updatedAt = ? WHERE slug = ?", [
    Date.now(),
    slug,
  ]);

/**
 * 最初の起動で、種類ごとに見本の商品を 1 つずつ入れる(触って試せるように)。
 * 一度でも商品があれば何もしない。管理画面で消せば消えたまま。SAMPLE_PRODUCTS=false で入れない。
 */
export function seedIfEmpty(): void {
  if (process.env.SAMPLE_PRODUCTS === "false") return;
  const n =
    db().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM product").get()
      ?.n ?? 0;
  if (n > 0) return;
  const samples: {
    slug: string;
    kind: ProductKind;
    name: string;
    price: number;
    description: string;
    payOnSite?: boolean;
    variants?: string[];
    file?: [string, string];
  }[] = [
    {
      slug: "sample-guide",
      kind: "download",
      name: "見本のダウンロード商品",
      price: 500,
      description:
        "<p>お支払いが済むと、ファイルを添付したメールとダウンロード用のリンクが届きます。</p><p>管理画面で説明・画像・送るファイルを差し替えてください。</p>",
      file: ["sample.txt", "noren の見本のファイルです。\n"],
    },
    {
      slug: "sample-tshirt",
      kind: "goods",
      name: "見本の T シャツ",
      price: 2500,
      description:
        "<p>会場で受け取る商品の見本です。サイズを選んで注文すると、受け取り用の QR がメールで届きます。</p>",
      payOnSite: true,
      variants: ["S", "M", "L", "XL"],
    },
    {
      slug: "sample-ticket",
      kind: "ticket",
      name: "見本の入場チケット",
      price: 1000,
      description:
        "<p>入場チケットの見本です。開催日時と会場をここに書いてください。受付でメールの QR を見せると入場できます。</p>",
      payOnSite: true,
      variants: ["一般", "学生"],
    },
  ];
  const now = Date.now();
  db().transaction(() => {
    samples.forEach((s, i) => {
      db().run(
        "INSERT INTO product (slug, kind, name, price, description, payOnSite, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          s.slug,
          s.kind,
          s.name,
          s.price,
          s.description,
          s.payOnSite ? 1 : 0,
          i + 1,
          now,
          now,
        ],
      );
      s.variants?.forEach((v, k) => {
        db().run(
          "INSERT INTO variant (productSlug, name, sortOrder) VALUES (?, ?, ?)",
          [s.slug, v, k + 1],
        );
      });
    });
  })();
  for (const s of samples) {
    if (!s.file) continue;
    mkdirSync(filesDirOf(s.slug), { recursive: true });
    writeFileSync(filePath(s.slug, s.file[0]), s.file[1]);
  }
  console.log(
    "商品テーブルが空だったので、見本の商品を 3 つ入れました(管理画面で消せます)",
  );
}
