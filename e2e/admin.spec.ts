import { expect, test } from "@playwright/test";

import {
  addVariants,
  APP,
  createProduct,
  login,
  PNG,
  SIDE,
  uploadFile,
  variantNames,
} from "./helpers";

test.describe("管理画面", () => {
  test("ダウンロード商品を作り、公開ページの形のまま編集し、公開側に反映される", async ({
    page,
  }) => {
    await createProduct(page, "e2e-book", "E2E 商品", 1200);

    // 名前・価格・通常価格。通常価格を入れると割引率の予告が出る
    await page.getByPlaceholder("商品名").fill("E2E の手引き");
    await page.locator('input[name="price"]').fill("1200");
    await page.locator('input[name="listPrice"]').fill("1500");
    await expect(page.getByText("20%OFF と出ます")).toBeVisible();

    // 説明は Tiptap。文字は先に全部打ち、行を選んでからツールバーで見出し・太字にする。
    // (ツールバーを押した直後にキーを送ると、焦点がボタンか編集域か走った回で変わる)
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.pressSequentially("収録内容");
    await editor.press("Enter");
    await editor.pressSequentially("使い方の手引きです。");
    await editor.locator("p").first().click();
    await editor.press("Home");
    await editor.press("Shift+End");
    await page.getByRole("button", { name: "見出し", exact: true }).click();
    await expect(editor.locator("h2")).toHaveText("収録内容");
    await editor.locator("p").last().click();
    await editor.press("Home");
    await editor.press("Shift+End");
    await page.getByTitle("太字").click();
    await expect(editor.locator("strong")).toHaveText("使い方の手引きです。");

    // Windows 専用に。ダウンロード商品には当日払いの札は出ない
    await page.getByText("Windows パソコン専用").click();
    await expect(page.getByText("当日払いの予約を受ける")).toHaveCount(0);

    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("保存しました")).toBeVisible();

    // 公開側: 太字と見出しが HTML として出て、script は出ない
    await page.goto("/items/e2e-book");
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E の手引き" }),
    ).toBeVisible();
    await expect(
      page.locator("div.prose strong", { hasText: "使い方の手引きです。" }),
    ).toBeVisible();
    await expect(
      page.locator("div.prose h2", { hasText: "収録内容" }),
    ).toBeVisible();
    await expect(page.getByText("Windows パソコン専用")).toBeVisible();
    await expect(page.getByText("20%OFF")).toBeVisible();
    // ファイルが無いのでまだ買えない
    await expect(page.getByRole("button", { name: "準備中" })).toBeDisabled();
  });

  test("送るファイル: MIME を持たない .iso も入り、入ると買える", async ({
    page,
  }) => {
    await createProduct(page, "e2e-iso", "ISO 商品");
    await uploadFile(page, "manual.iso", "x".repeat(2048));
    await expect(page.getByText("販売中")).toBeVisible();
    await page.goto("/items/e2e-iso");
    await expect(page.getByRole("button", { name: "購入する" })).toBeEnabled();
    await expect(page.getByText("manual.iso")).toBeVisible();

    // 外すと準備中に戻る
    await page.goto("/admin/e2e-iso");
    await page
      .locator("li", { hasText: "manual.iso" })
      .getByRole("button", { name: "削除" })
      .click();
    await expect(page.getByText("準備中(ファイル無し)")).toBeVisible();
  });

  test("物販: 種類(サイズ)を足して並べ替え、当日払いの予約を受ける。公開側に数量の欄が出る", async ({
    page,
  }) => {
    await createProduct(page, "e2e-shirt", "E2E シャツ", 3000, "goods");
    await expect(page.getByText("送るファイル")).toHaveCount(0);
    await addVariants(page, ["S", "M", "L"]);
    expect(await variantNames(page)).toEqual(["S", "M", "L"]);
    await page.getByRole("button", { name: "L を前へ" }).click();
    await expect.poll(() => variantNames(page)).toEqual(["S", "L", "M"]);
    await page.getByRole("button", { name: "S を消す" }).click();
    await expect.poll(() => variantNames(page)).toEqual(["L", "M"]);

    await page.getByText("当日払いの予約を受ける").click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("保存しました")).toBeVisible();
    // 物販はファイルが無くても、公開なら販売中
    await expect(page.getByText("販売中")).toBeVisible();

    await page.goto("/items/e2e-shirt");
    await expect(page.getByText("会場で受け取り").first()).toBeVisible();
    await expect(page.getByLabel("L", { exact: true })).toBeVisible();
    await expect(page.getByLabel("M", { exact: true })).toBeVisible();
    await expect(page.getByLabel("S", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("当日払いで予約する(会場で現金)"),
    ).toBeVisible();
  });

  test("チケット: 種類の無いチケットは数量だけを選ぶ", async ({ page }) => {
    await createProduct(page, "e2e-ticket", "E2E 入場券", 1500, "ticket");
    await page.goto("/items/e2e-ticket");
    await expect(page.getByText("入場チケット").first()).toBeVisible();
    await expect(page.getByLabel("E2E 入場券", { exact: true })).toHaveValue(
      "1",
    );
    await expect(
      page.getByText("受付で、メールの注文ページの QR"),
    ).toBeVisible();
  });

  test("画像: 複数入れて、代表を入れ替え、外す。公開側はメイン + サムネイル", async ({
    page,
  }) => {
    await createProduct(page, "e2e-img", "画像商品");
    const add = page.locator('input[type="file"][name="image"]');
    await add.setInputFiles([
      { name: "a.png", mimeType: "image/png", buffer: PNG },
      { name: "b.png", mimeType: "image/png", buffer: PNG },
    ]);
    const thumbs = page.locator("ul.pics li");
    await expect(thumbs).toHaveCount(2);
    await expect(thumbs.nth(0).getByText("代表")).toBeVisible();

    // 2 枚目を前へ → 代表が入れ替わる(画像の URL の名前で見る)
    const srcBefore = await thumbs.nth(1).locator("img").getAttribute("src");
    await thumbs.nth(1).hover();
    await thumbs.nth(1).getByTitle("前へ").click();
    await expect(thumbs.nth(0).getByText("代表")).toBeVisible();
    const srcAfter = await thumbs.nth(0).locator("img").getAttribute("src");
    expect(srcAfter?.split("?")[0]).toBe("/products/e2e-img/images/01.png");
    expect(srcBefore?.split("?")[0]).toBe("/products/e2e-img/images/02.png");

    // 公開側: メイン画像とサムネイル 2 つ。拡大して Esc で閉じる
    await page.goto("/items/e2e-img");
    await expect(page.locator("figure img").first()).toHaveAttribute(
      "src",
      /images\/01\.png/,
    );
    await expect(page.getByRole("button", { name: /枚目を見る/ })).toHaveCount(
      2,
    );
    await page.getByRole("button", { name: "画像を拡大する" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // 1 枚外す
    await page.goto("/admin/e2e-img");
    await thumbs.nth(0).hover();
    await thumbs.nth(0).getByTitle("外す").click();
    await expect(thumbs).toHaveCount(1);
  });

  test("非公開にすると一覧からも URL からも消え、削除は slug を打たないと効かない", async ({
    page,
  }) => {
    await createProduct(page, "e2e-hide", "隠す商品");
    await page.getByText("公開中").click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("保存しました")).toBeVisible();
    expect((await page.request.get("/items/e2e-hide")).status()).toBe(404);
    await page.goto("/");
    await expect(page.getByRole("link", { name: /隠す商品/ })).toHaveCount(0);

    await page.goto("/admin/e2e-hide");
    const danger = page.locator("details.fold", {
      hasText: "この商品を削除",
    });
    await danger.locator("summary").click();
    await expect(danger).toHaveAttribute("open", "");
    await page.getByPlaceholder("e2e-hide").fill("wrong");
    await page.getByRole("button", { name: "この商品を削除" }).click();
    await expect(page.getByText("slug をそのまま入力")).toBeVisible();
    // 送信で画面が作り直され details は閉じている。開き直してから正しい slug
    await danger.locator("summary").click();
    await expect(danger).toHaveAttribute("open", "");
    await page.getByPlaceholder("e2e-hide").fill("e2e-hide");
    await page.getByRole("button", { name: "この商品を削除" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("link", { name: "隠す商品" })).toHaveCount(0);
  });

  test("お店の設定: 店の名前・問い合わせ先・お店について・特定商取引法の表記が公開側に出る", async ({
    page,
  }) => {
    await login(page);
    await page.getByRole("link", { name: "お店の設定" }).click();
    await page.getByLabel(/^店の名前/).fill("E2E の店");
    await page.getByLabel(/^問い合わせ先/).fill("info@example.test");
    await page.getByLabel(/^運営者/).fill("見本 運営");
    await page.getByLabel(/^リンク/).fill("サイト https://example.com");
    await page.getByLabel("販売業者").fill("E2E の店");
    await page.getByLabel("電話番号").fill("");
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.press("ControlOrMeta+a");
    await editor.pressSequentially("E2E のお店の紹介です。");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("保存しました");

    await page.goto("/about");
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E の店について" }),
    ).toBeVisible();
    await expect(page.getByText("E2E のお店の紹介です。")).toBeVisible();
    await expect(page.locator("footer")).toContainText("info@example.test");
    await expect(page.locator("footer")).toContainText("運営 見本 運営");
    await expect(
      page.locator("footer").getByRole("link", { name: "サイト" }),
    ).toHaveAttribute("href", "https://example.com");
    await page.goto("/tokushoho");
    await expect(page.locator("tr", { hasText: "販売業者" })).toContainText(
      "E2E の店",
    );
    // 空にした行は出さない。連絡先は問い合わせ先
    await expect(page.locator("tr", { hasText: "電話番号" })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /^連絡先/ })).toContainText(
      "info@example.test",
    );
    await expect(page).toHaveTitle(/E2E の店/);

    // 正しくないリンクは保存しない
    await page.goto("/admin/settings");
    await page.getByLabel(/^リンク/).fill("悪い javascript:alert(1)");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("リンクは");
  });

  test("ロール: スタッフは管理画面を開けず、ロールの無い人はログインできない", async ({
    page,
  }) => {
    await login(page, "staff");
    expect((await page.request.get("/admin")).status()).toBe(403);
    await expect(
      page.getByRole("link", { name: "管理", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "スタッフ", exact: true }),
    ).toBeVisible();

    await page.request.post("/logout", {
      maxRedirects: 0,
      headers: { origin: APP },
    });
    await page.request.post(`${SIDE}/idp/role`, { data: "none" });
    const res = await page.goto("/login?to=/staff");
    expect(res?.status()).toBe(403);
    await expect(
      page.getByText(/ロール admin も staff も持っていません/),
    ).toBeVisible();
    await page.request.post(`${SIDE}/idp/role`, { data: "admin" });
  });
});
