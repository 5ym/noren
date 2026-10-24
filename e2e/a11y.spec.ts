import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { login } from "./helpers";

/**
 * axe で WCAG 2.2 AA を見る。明るい画面と暗い画面の両方で、公開側・管理・スタッフの画面を回る。
 * html5-qrcode がカメラの枠に差し込む部品(#qr-reader)は外のライブラリのものなので外す。
 */
async function check(page: Page, path: string) {
  await page.goto(path);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude("#qr-reader")
    .analyze();
  const found = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
  expect(found, `${path} の axe の指摘`).toEqual([]);
}

/** 当日払いで予約して、その注文ページ(QR が出る)の道を返す */
async function reserved(page: Page): Promise<string> {
  await page.goto("/items/sample-ticket");
  await page.getByLabel("一般", { exact: true }).fill("1");
  await page.getByText("当日払いで予約する(会場で現金)").click();
  await page.getByLabel(/^メールアドレス/).fill("a11y@example.test");
  await page.getByLabel("お名前").fill("見本 太郎");
  await page.getByRole("button", { name: "当日払いで予約する" }).click();
  await expect(page).toHaveURL(/\/orders\//);
  return new URL(page.url()).pathname;
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`アクセシビリティ(${colorScheme})`, () => {
    test.use({ colorScheme });

    test("公開側", async ({ page }) => {
      for (const path of [
        "/",
        "/items/sample-guide",
        "/items/sample-tshirt",
        "/items/sample-ticket",
        "/about",
        "/tokushoho",
      ]) {
        await check(page, path);
      }
      // 予約のフォームを開いた状態・注文ページ
      await page.goto("/items/sample-tshirt");
      await page.getByText("当日払いで予約する(会場で現金)").click();
      await check(page, await reserved(page));
    });

    test("管理とスタッフ", async ({ page }) => {
      const order = await reserved(page);
      await page.goto(order);
      const code = (await page.locator("code.code").textContent())?.trim();
      await login(page);
      for (const path of [
        "/admin",
        "/admin/sample-tshirt",
        "/admin/sample-guide",
        "/admin/orders",
        "/admin/settings",
        "/staff",
        "/staff/sell",
        "/staff/list?kind=goods",
        "/staff/list?kind=ticket",
        "/staff/scan",
        `/staff/o/${code}`,
      ]) {
        await check(page, path);
      }
    });
  });
}
