import { expect, test } from "@playwright/test";

test.describe("公開ページ", () => {
  test("トップ: 店名と、最初の起動で入った見本の商品と、購入の流れが出る", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "商品一覧" })).toBeVisible();
    await expect(page.getByText(/^\d+ 点$/)).toBeVisible();
    for (const name of [
      "見本のダウンロード商品",
      "見本の T シャツ",
      "見本の入場チケット",
    ]) {
      await expect(
        page.getByRole("link", { name: new RegExp(name) }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "ご購入の流れ" }),
    ).toBeVisible();
  });

  test("商品ページ: 物販は種類ごとの数量と当日払いの予約、ダウンロードは購入だけ", async ({
    page,
  }) => {
    await page.goto("/items/sample-tshirt");
    await expect(
      page.getByRole("heading", { level: 1, name: "見本の T シャツ" }),
    ).toBeVisible();
    await expect(page.getByText("¥2,500")).toBeVisible();
    for (const size of ["S", "M", "L", "XL"])
      await expect(page.getByLabel(size, { exact: true })).toHaveValue("0");
    await expect(
      page.getByText("当日払いで予約する(会場で現金)"),
    ).toBeVisible();

    await page.goto("/items/sample-guide");
    await expect(page.getByRole("button", { name: "購入する" })).toBeEnabled();
    await expect(page.getByText("sample.txt")).toBeVisible();
    await expect(page.getByText("当日払いで予約")).toHaveCount(0);
    // 他の商品が並ぶ(自分は除く)
    await expect(page.getByRole("heading", { name: "他の商品" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /見本のダウンロード商品/ }),
    ).toHaveCount(0);
  });

  test("数量を 1 つも選ばずに買おうとすると、その場で断る", async ({
    page,
  }) => {
    await page.goto("/items/sample-tshirt");
    await page.getByRole("button", { name: "購入する" }).click();
    await expect(page.getByRole("alert")).toContainText("数量を選んでください");
  });

  test("特定商取引法の表と、お店について", async ({ page }) => {
    await page.goto("/tokushoho");
    await expect(
      page.getByRole("heading", { name: "特定商取引法に基づく表記" }),
    ).toBeVisible();
    await expect(page.locator("tr", { hasText: "販売業者" })).toBeVisible();

    // 本文は管理画面の設定で変わる(admin.spec が書き換える)ので、見出しと事業者情報へのリンクだけ
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { level: 1, name: /について$/ }),
    ).toBeVisible();
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: "特定商取引法に基づく表記" }),
    ).toBeVisible();
  });

  test("非公開・存在しない商品と注文は 404、管理とスタッフの画面は未ログインだとログインへ", async ({
    request,
  }) => {
    expect((await request.get("/items/nope")).status()).toBe(404);
    expect((await request.get("/orders/nope")).status()).toBe(404);
    expect((await request.get("/dl/nope/x/y")).status()).toBe(404);
    // fetch(HTML を要求しない)は 401。画面の読み込みだけログインへ送る
    for (const path of ["/admin", "/staff", "/staff/o/ABCDEFGHJKLM"]) {
      expect(
        (
          await request.get(path, {
            headers: { accept: "application/json" },
          })
        ).status(),
      ).toBe(401);
    }
    const res = await request.get("/staff/scan", {
      headers: { accept: "text/html" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe("/login?to=%2Fstaff%2Fscan");
  });
});
