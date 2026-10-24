import { afterAll, describe, expect, test } from "bun:test";

import { imageUrl, type ProductView } from "../src/lib/product";
import {
  createProduct,
  deleteProduct,
  getProduct,
  imageMime,
  listImages,
  moveImage,
  ProductError,
  removeImage,
  saveImage,
} from "../src/lib/server/products";

/** 作ったばかりなので必ずある */
const img = () => getProduct("img") as ProductView;

const png = (name: string) =>
  new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], name, {
    type: "image/png",
  });

describe("images", () => {
  // 他のテストファイルより先に走ることがある。products.test の「最初の起動で見本の
  // 商品」は商品テーブルが空である前提なので、ここで作った商品は必ず片付ける
  afterAll(() => {
    for (const slug of ["img"]) if (getProduct(slug)) deleteProduct(slug);
  });

  test("足した順に並び、1 枚目が代表。動かす・外すで番号が付け直される", async () => {
    createProduct({ slug: "img", name: "画像", price: 100 });
    expect(getProduct("img")?.images).toEqual([]);
    expect(imageUrl(img())).toBeNull();

    await saveImage("img", png("a.png"));
    await saveImage("img", png("b.png"));
    await saveImage(
      "img",
      new File([new Uint8Array([1, 2])], "c.jpg", { type: "image/jpeg" }),
    );
    expect(listImages("img")).toEqual(["01.png", "02.png", "03.jpg"]);
    expect(imageUrl(img())).toContain("/products/img/images/01.png?v=");

    // 3 枚目を前へ → 02 になり、元の 02 は 03 に
    moveImage("img", "03.jpg", -1);
    expect(listImages("img")).toEqual(["01.png", "02.jpg", "03.png"]);
    // 端では何もしない
    moveImage("img", "01.png", -1);
    expect(listImages("img")).toEqual(["01.png", "02.jpg", "03.png"]);

    removeImage("img", "01.png");
    expect(listImages("img")).toEqual(["02.jpg", "03.png"]);
    expect(imageUrl(img())).toContain("02.jpg");
    // 次に足すと最大 + 1
    await saveImage("img", png("d.png"));
    expect(listImages("img")).toEqual(["02.jpg", "03.png", "04.png"]);

    expect(() => removeImage("img", "../etc/passwd")).toThrow(ProductError);
    await expect(
      saveImage("img", new File(["x"], "x.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow(ProductError);
    await expect(
      saveImage("img", new File([], "e.png", { type: "image/png" })),
    ).rejects.toThrow(ProductError);
  });

  test("配信の content-type は名前から。形式に合わない名前は配らない", () => {
    expect(imageMime("01.jpg")).toBe("image/jpeg");
    expect(imageMime("12.avif")).toBe("image/avif");
    expect(imageMime("image")).toBeNull();
    expect(imageMime("01.svg")).toBeNull();
    expect(imageMime("../x.png")).toBeNull();
  });
});
