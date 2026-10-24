import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import db from "../src/lib/server/db";
import {
  addVariants,
  createProduct,
  deleteProduct,
  filePath,
  getProduct,
  listProducts,
  moveVariant,
  ProductError,
  removeVariant,
  renameVariant,
  safeFileName,
  saveFile,
  seedIfEmpty,
  updateProduct,
} from "../src/lib/server/products";

/** 他のテストが使う商品。ファイルを 1 つ入れて「販売中」にする。 */
export async function readyProduct(slug = "ready", name = "テスト商品") {
  const existing = getProduct(slug);
  if (existing) return existing;
  createProduct({ slug, name, price: 500 });
  await saveFile(slug, "data.zip", new Blob(["dummy zip"]));
  return getProduct(slug) as NonNullable<ReturnType<typeof getProduct>>;
}

const blank = {
  name: "x",
  price: 1,
  listPrice: "",
  description: "",
  windowsOnly: null,
  payOnSite: null,
  active: "on",
  sortOrder: 0,
};

describe("products", () => {
  test("最初の起動で種類ごとの見本が入る。二度目は入れない", () => {
    // 他のテストファイルが先に作った商品があれば片付けてから
    db().run("DELETE FROM product");
    seedIfEmpty();
    const all = listProducts(true);
    expect(all.map((p) => [p.slug, p.kind])).toEqual([
      ["sample-guide", "download"],
      ["sample-tshirt", "goods"],
      ["sample-ticket", "ticket"],
    ]);
    // ダウンロードの見本はファイル付きで買える。T シャツはサイズを持つ
    expect(all[0].available).toBe(true);
    expect(all[0].files).toEqual(["sample.txt"]);
    expect(all[1].variants.map((v) => v.name)).toEqual(["S", "M", "L", "XL"]);
    expect(all[1].payOnSite).toBe(true);
    seedIfEmpty();
    expect(listProducts(true)).toHaveLength(3);
    for (const p of all) deleteProduct(p.slug);
  });

  test("SAMPLE_PRODUCTS=false なら見本を入れない", () => {
    process.env.SAMPLE_PRODUCTS = "false";
    try {
      seedIfEmpty();
      expect(listProducts(true)).toHaveLength(0);
    } finally {
      process.env.SAMPLE_PRODUCTS = "";
    }
  });

  test("入口の検証: slug の形・空の名前・負の価格・知らない種類・重複は ProductError", async () => {
    expect(() =>
      createProduct({ slug: "Bad Slug", name: "x", price: 1 }),
    ).toThrow(ProductError);
    expect(() => createProduct({ slug: "ok", name: "", price: 1 })).toThrow(
      ProductError,
    );
    expect(() => createProduct({ slug: "ok", name: "x", price: -1 })).toThrow(
      ProductError,
    );
    expect(() =>
      createProduct({ slug: "ok", name: "x", price: 1, kind: "food" }),
    ).toThrow(/種類/);
    const p = await readyProduct("crud", "CRUD");
    expect(p.available).toBe(true);
    expect(() => createProduct({ slug: "crud", name: "x", price: 1 })).toThrow(
      /もうあります/,
    );
    // 説明の CRLF は LF に寄せる(平文の説明)。当日払いはダウンロード商品には付かない
    updateProduct("crud", {
      ...blank,
      name: "CRUD 2",
      price: 700,
      listPrice: "1000",
      description: "説明\r\n2 行目",
      windowsOnly: "on",
      payOnSite: "on",
      active: null,
      sortOrder: 9,
    });
    const after = getProduct("crud");
    expect(after?.description).toBe("説明\n2 行目");
    expect(after?.descriptionHtml).toBe("<p>説明<br>2 行目</p>");
    expect(after).toMatchObject({
      windowsOnly: true,
      payOnSite: false,
      active: false,
      available: false,
    });
    deleteProduct("crud");
    expect(getProduct("crud")).toBeNull();
  });

  test("物販: ファイルが無くても公開なら買える。種類を足す・名前を変える・並べ替える・消す", async () => {
    createProduct({
      slug: "shirt",
      name: "シャツ",
      price: 2000,
      kind: "goods",
    });
    expect(getProduct("shirt")?.available).toBe(true);
    updateProduct("shirt", {
      ...blank,
      name: "シャツ",
      price: 2000,
      windowsOnly: "on",
      payOnSite: "on",
    });
    expect(getProduct("shirt")).toMatchObject({
      windowsOnly: false,
      payOnSite: true,
    });

    addVariants("shirt", "S\nM\r\nL、XL");
    const names = () => getProduct("shirt")?.variants.map((v) => v.name);
    expect(names()).toEqual(["S", "M", "L", "XL"]);
    const [s, m] = getProduct("shirt")?.variants ?? [];
    moveVariant("shirt", m.id, -1);
    expect(names()).toEqual(["M", "S", "L", "XL"]);
    // 端では何もしない
    moveVariant("shirt", m.id, -1);
    expect(names()).toEqual(["M", "S", "L", "XL"]);
    renameVariant("shirt", s.id, "SS");
    removeVariant("shirt", m.id);
    expect(names()).toEqual(["SS", "L", "XL"]);
    expect(() => renameVariant("shirt", 99999, "x")).toThrow(ProductError);
    expect(() => addVariants("shirt", "  ")).toThrow(ProductError);
    // ダウンロード商品に種類は付かない・物販にファイルは送れない
    createProduct({ slug: "dl-x", name: "DL", price: 100 });
    expect(() => addVariants("dl-x", "A")).toThrow(/ダウンロード/);
    await expect(saveFile("shirt", "a.zip", new Blob(["x"]))).rejects.toThrow(
      ProductError,
    );
    deleteProduct("shirt");
    deleteProduct("dl-x");
  });

  test("ファイル名はフォルダの中に収まるものだけ", async () => {
    expect(safeFileName("C:\\Users\\x\\a b.zip")).toBe("a b.zip");
    expect(safeFileName("../etc/passwd")).toBe("passwd");
    expect(() => safeFileName("..")).toThrow(ProductError);
    expect(() => safeFileName(".hidden")).toThrow(ProductError);
    expect(() => safeFileName("x.uploading")).toThrow(ProductError);
    await readyProduct("names");
    await expect(saveFile("names", "empty.zip", new Blob([]))).rejects.toThrow(
      /空/,
    );
    // アップロードの本文は ReadableStream で来る。細切れでも全部つながること
    const parts = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array(1_000_000).fill(7),
      new Uint8Array([9]),
    ];
    await saveFile(
      "names",
      "stream.bin",
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const p of parts) controller.enqueue(p);
          controller.close();
        },
      }),
    );
    const written = await Bun.file(filePath("names", "stream.bin")).bytes();
    expect(written.length).toBe(1_000_004);
    expect(Array.from(written.slice(0, 3))).toEqual([1, 2, 3]);
    expect(written[written.length - 1]).toBe(9);
    expect(existsSync(`${filePath("names", "stream.bin")}.uploading`)).toBe(
      false,
    );
    expect(getProduct("names")?.files).toEqual(["data.zip", "stream.bin"]);
    await expect(saveFile("nope", "a.zip", new Blob(["x"]))).rejects.toThrow(
      ProductError,
    );
    deleteProduct("names");
  });
});
