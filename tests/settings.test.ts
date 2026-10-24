import { describe, expect, test } from "bun:test";

import {
  parseLinks,
  saveShop,
  SettingsError,
  shop,
  shopMailTo,
} from "../src/lib/server/settings";
import { DEFAULT_SHOP } from "../src/lib/shop";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("お店の設定", () => {
  test("何も設定していなければ見本の値(個人の情報は入っていない)", () => {
    expect(shop()).toEqual(DEFAULT_SHOP);
    expect(DEFAULT_SHOP.email).toBe("");
    expect(DEFAULT_SHOP.owner).toBe("");
    expect(DEFAULT_SHOP.links).toEqual([]);
  });

  test("リンクは 1 行に「ラベル URL」、http(s) だけ", () => {
    expect(
      parseLinks("サイト https://example.com\n\n X  https://x.example/a "),
    ).toEqual([
      { label: "サイト", href: "https://example.com" },
      { label: "X", href: "https://x.example/a" },
    ]);
    expect(() => parseLinks("悪い javascript:alert(1)")).toThrow(SettingsError);
    expect(() => parseLinks("ラベルだけ")).toThrow(SettingsError);
  });

  test("保存すると読める。お店についての HTML は sanitize する", () => {
    saveShop(
      form({
        name: "見本の店",
        tagline: "一言",
        email: "info@example.test",
        owner: "見本 太郎",
        links: "サイト https://example.com",
        aboutHtml: '<p onclick="x">本文</p><script>alert(1)</script>',
        "tokushoho.seller": "見本の店",
        "tokushoho.phone": "",
      }),
    );
    const s = shop();
    expect(s).toMatchObject({
      name: "見本の店",
      email: "info@example.test",
      owner: "見本 太郎",
      links: [{ label: "サイト", href: "https://example.com" }],
      aboutHtml: "<p>本文</p>",
    });
    expect(s.tokushoho.seller).toBe("見本の店");
    // 空にした行は空のまま(画面では出さない)
    expect(s.tokushoho.phone).toBe("");
    process.env.SHOP_MAIL_TO = "";
    expect(shopMailTo()).toBe("info@example.test");
    process.env.SHOP_MAIL_TO = "shop@example.test";

    expect(() => saveShop(form({ name: "" }))).toThrow(/店の名前/);
    expect(() => saveShop(form({ name: "x", email: "nope" }))).toThrow(
      /メールアドレス/,
    );
    // 失敗したときは何も変わらない
    expect(shop().name).toBe("見本の店");
  });
});
