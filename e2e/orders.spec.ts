import { expect, test } from "@playwright/test";

import {
  buyer,
  clearMails,
  clearPosts,
  createProduct,
  lastMailTo,
  login,
  mails,
  orderPath,
  patchSession,
  payByCard,
  posts,
  startCheckout,
  uploadFile,
  webhook,
} from "./helpers";

/** 注文ページの QR の下に出る番号 */
const codeOn = async (page: import("@playwright/test").Page) =>
  (await page.locator("code.code").textContent())?.trim() ?? "";

test.describe("Checkout から注文ページまで", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await createProduct(page, "e2e-paid", "納品テスト", 500);
    await uploadFile(page, "data.zip", "zip bytes");
    await page.close();
  });
  test.beforeEach(async ({ request }) => {
    await clearMails(request);
    await clearPosts(request);
  });

  test("署名が無い・合わないものは 400 で、何も送らない", async ({
    request,
  }) => {
    const bad = await webhook(
      request,
      { id: "cs_test_bad" },
      undefined,
      "whsec_other",
    );
    expect(bad.status()).toBe(400);
    const none = await request.post("/api/stripe/webhook", {
      data: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(none.status()).toBe(400);
    expect(await mails(request)).toHaveLength(0);
  });

  test("ダウンロード: 購入する → 決済 → ファイル添付のメール、リンクと注文ページから落とせる、二度目は送らない", async ({
    page,
    request,
  }) => {
    await page.goto("/items/e2e-paid");
    const session = await startCheckout(page);
    expect(session.amount_total).toBe(500);
    const paid = await payByCard(request, session);

    const sent = await mails(request);
    expect(sent).toHaveLength(2);
    const mail = sent.find((m) => m.to.includes(buyer.email));
    const shop = sent.find((m) => m.to.includes("shop@example.test"));
    expect(mail?.subject).toContain("納品テスト をお送りします");
    expect(mail?.raw).toContain('filename="data.zip"');
    expect(shop?.text).toContain(buyer.email);

    // メールのリンクは実ファイルに解決する
    const link = mail?.text.match(
      /http:\/\/127\.0\.0\.1:4173\/dl\/[^\s"<>]+/,
    )?.[0];
    expect(link).toBeTruthy();
    const dl = await request.get(link as string);
    expect(dl.status()).toBe(200);
    expect(await dl.text()).toBe("zip bytes");
    expect((await request.get(`${link}x`)).status()).toBe(404);

    // 決済のあと Stripe が戻す先(thanks)から注文ページへ
    await page.goto(session.success_url);
    await expect(
      page.getByRole("heading", { name: "ご購入ありがとうございます" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "注文ページを開く" }).click();
    await expect(page).toHaveURL(orderPath(mail));
    await expect(
      page.getByRole("heading", { name: "ダウンロード" }),
    ).toBeVisible();
    await expect(page.getByText("支払い済み")).toBeVisible();
    // ダウンロード商品だけなら QR は出さない
    await expect(page.getByRole("img", { name: /QR コード/ })).toHaveCount(0);
    const fromPage = await page
      .getByRole("link", { name: "data.zip" })
      .getAttribute("href");
    expect(await (await request.get(fromPage as string)).text()).toBe(
      "zip bytes",
    );

    // Stripe は同じイベントを何度でも送ってくる
    const again = await webhook(request, paid);
    expect(await again.text()).toBe("already delivered");
    expect(await mails(request)).toHaveLength(2);
    expect((await posts(request)).some((p) => p.text.startsWith("💴"))).toBe(
      true,
    );
  });

  test("物販: サイズと数量を選んで買い、メールの注文ページの QR をスタッフが読んで受け渡す", async ({
    page,
    request,
  }) => {
    await page.goto("/items/sample-tshirt");
    await page.getByLabel("M", { exact: true }).fill("2");
    await page.getByLabel("L", { exact: true }).fill("1");
    const session = await startCheckout(page);
    expect(session.amount_total).toBe(7500);
    await payByCard(request, session);

    const mail = await lastMailTo(request, buyer.email);
    expect(mail?.subject).toContain("ご注文を承りました");
    expect(mail?.text).toContain("見本の T シャツ(M) × 2");
    expect(mail?.text).toContain("QR コード");
    await page.goto(orderPath(mail));
    await expect(
      page.getByRole("heading", { name: "受け取り用の QR コード" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "受け取り用の QR コード" }),
    ).toBeVisible();
    const code = await codeOn(page);
    expect(code).toMatch(/^[A-Za-z0-9]{12}$/);

    // スタッフ: 番号で開いて受け渡し。二度目は断る
    await login(page, "staff");
    await page.getByRole("link", { name: /QR を読む/ }).click();
    await page.getByLabel(/12 文字の番号/).fill(code);
    await page.getByRole("button", { name: "開く" }).click();
    await expect(page).toHaveURL(new RegExp(`/staff/o/${code}$`));
    await expect(page.getByText("見本の T シャツ(M)")).toBeVisible();
    await page.getByRole("button", { name: "受け取りを記録" }).click();
    await expect(page.getByRole("status")).toContainText(
      "受け取りを記録しました",
    );
    await expect(page.getByText(/受け取り済み/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "受け取りを記録" }),
    ).toHaveCount(0);

    // QR の中身(スタッフ画面の URL)でも同じ注文が開く。取り消すと戻る
    await page.goto(`/staff/o/${code}`);
    await page.getByRole("button", { name: "受け取りを取り消す" }).click();
    await expect(
      page.getByRole("button", { name: "受け取りを記録" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "受け取りを記録" }).click();
    await expect(page.getByText(/受け取り済み/)).toBeVisible();

    // 客の注文ページにも受け取り済みと出る
    await page.goto(orderPath(mail));
    await expect(page.getByText("受け取り済み").first()).toBeVisible();
  });

  test("チケット: コンビニ払いは入金待ち → 入金で注文ページのメール → 受付で入場。期限切れは終了", async ({
    page,
    request,
  }) => {
    await page.goto("/items/sample-ticket");
    await page.getByLabel("一般", { exact: true }).fill("2");
    const session = await startCheckout(page);
    const unpaid = await patchSession(request, session.id, {
      payment_status: "unpaid",
      payment_method_types: ["konbini"],
      payment_intent: "pi_e2e_konbini",
      customer_details: buyer,
    });
    expect(await (await webhook(request, unpaid)).text()).toBe("not paid yet");
    expect(await mails(request)).toHaveLength(0);

    // 入金待ちは thanks で「確認が取れ次第」と言う
    await page.goto(session.success_url);
    await expect(page.getByText("お支払いの確認が取れ次第")).toBeVisible();

    await login(page);
    await expect(page.getByText(/入金待ち 1/)).toBeVisible();
    await page.goto("/admin/orders");
    const row = page.locator("tr", { hasText: buyer.email }).first();
    await expect(row).toContainText("入金待ち");
    await expect(row).toContainText("コンビニ");
    await expect(
      page.getByText("こちらで取り消す操作はありません"),
    ).toBeVisible();

    // 入金 → 支払い済みになり、メールが届く
    const paid = await patchSession(request, session.id, {
      payment_status: "paid",
    });
    expect(
      await (
        await webhook(request, paid, "checkout.session.async_payment_succeeded")
      ).text(),
    ).toBe("delivered");
    const mail = await lastMailTo(request, buyer.email);
    expect(mail?.text).toContain("見本の入場チケット(一般) × 2");
    await page.goto(orderPath(mail));
    await expect(
      page.getByRole("heading", { name: "入場用の QR コード" }),
    ).toBeVisible();
    const code = await codeOn(page);

    await login(page, "staff");
    await page.goto(`/staff/o/${code}`);
    await expect(page.getByRole("heading", { name: "入場" })).toBeVisible();
    await page.getByRole("button", { name: "入場を記録" }).click();
    await expect(page.getByText(/入場済み/)).toBeVisible();
    await page.goto("/staff/list?kind=ticket");
    await expect(
      page.getByRole("heading", { name: "最近の入場" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: code })).toBeVisible();

    // 別の注文が銀行振込のまま期限切れ → 未入金で終了。メールは送らない
    await clearMails(request);
    await page.goto("/items/sample-ticket");
    await page.getByLabel("学生", { exact: true }).fill("1");
    const bank = await startCheckout(page);
    const bankUnpaid = await patchSession(request, bank.id, {
      payment_status: "unpaid",
      payment_method_types: ["customer_balance"],
      customer_details: { email: "bank@example.test", name: "振込 次郎" },
    });
    await webhook(request, bankUnpaid);
    await webhook(request, bankUnpaid, "checkout.session.async_payment_failed");
    await login(page);
    await page.goto("/admin/orders");
    await expect(
      page.locator("tr", { hasText: "bank@example.test" }),
    ).toContainText("未入金で終了");
    expect(await mails(request)).toHaveLength(0);
    await page.goto("/admin");
    await expect(page.getByText(/入金待ち \d/)).toHaveCount(0);
  });

  test("当日払いの予約: メールとお名前だけで予約し、会場で代金を受けて渡す", async ({
    page,
    request,
  }) => {
    await page.goto("/items/sample-tshirt");
    await page.getByLabel("S", { exact: true }).fill("1");
    await page.getByText("当日払いで予約する(会場で現金)").click();
    await page.getByLabel(/^メールアドレス/).fill("reserve@example.test");
    await page.getByLabel("お名前").fill("予約 花子");
    await page.getByRole("button", { name: "当日払いで予約する" }).click();
    await expect(page).toHaveURL(/\/orders\/[\w-]+\?new=1$/);
    await expect(page.getByRole("status")).toContainText("ご予約を承りました");
    await expect(page.getByText("当日払い・未払い")).toBeVisible();
    await expect(
      page.getByText("現金で ¥2,500 をお支払いください"),
    ).toBeVisible();
    const code = await codeOn(page);

    const mail = await lastMailTo(request, "reserve@example.test");
    expect(mail?.subject).toContain("ご予約を承りました");
    expect(page.url()).toContain(orderPath(mail));

    await login(page, "staff");
    await page.goto("/staff/list?kind=goods");
    await expect(page.getByText(/うち当日払いの未払いは合計/)).toBeVisible();
    await page.goto(`/staff/o/${code}`);
    await expect(page.getByText("¥2,500").first()).toBeVisible();
    // 未払いのまま「受け取りを記録」は出さない
    await expect(
      page.getByRole("button", { name: "受け取りを記録" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "代金を受けて受け取り" }).click();
    await expect(page.getByText(/受け取り済み/)).toBeVisible();
    await expect(page.getByText("支払い済み")).toBeVisible();
  });

  test("知らない注文の決済は 200 で止め、店に知らせる", async ({ request }) => {
    const res = await webhook(request, {
      id: "cs_test_ghost",
      payment_status: "paid",
      customer_details: buyer,
      metadata: { order: "999999" },
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe("unresolvable session");
    expect(await mails(request)).toHaveLength(0);
    expect((await posts(request)).some((p) => p.text.startsWith("🚨"))).toBe(
      true,
    );
  });
});

test.describe("当日販売(スタッフ)", () => {
  test("現金: まとめて選んで記録すると、支払い済み・受け渡し済みの注文になる", async ({
    page,
  }) => {
    await login(page, "staff");
    await page.goto("/staff/sell");
    const shirt = page.locator("fieldset", { hasText: "見本の T シャツ" });
    await shirt.getByLabel("M", { exact: true }).fill("1");
    const ticket = page.locator("fieldset", { hasText: "見本の入場チケット" });
    await ticket.getByLabel("一般", { exact: true }).fill("2");
    await expect(page.getByText("合計 ¥4,500")).toBeVisible();
    // ダウンロード商品は会場では売らない
    await expect(
      page.locator("fieldset", { hasText: "見本のダウンロード商品" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "現金で受け取った" }).click();
    await expect(page).toHaveURL(/\/staff\/o\/\w+\?sold=1$/);
    await expect(page.getByRole("status")).toContainText("会計を記録しました");
    await expect(page.getByText("支払い済み")).toBeVisible();
    await expect(page.getByText(/受け取り済み/)).toBeVisible();

    await login(page);
    await page.goto("/admin/orders");
    await expect(
      page.locator("tr", { hasText: "会場で販売" }).first(),
    ).toContainText("¥4,500");
  });

  test("Square: 会計待ちで Square POS の URL を出し、戻ってきたら済ませる", async ({
    page,
  }) => {
    await login(page, "staff");
    await page.goto("/staff/sell");
    // 画面は Square POS(intent: の URL)を開こうとするが、ブラウザには無いので何も起きない
    await page
      .locator("fieldset", { hasText: "見本の入場チケット" })
      .getByLabel("学生", { exact: true })
      .fill("1");
    await page.getByRole("button", { name: "Square で会計" }).click();
    const open = page.getByRole("link", { name: "Square POS を開く" });
    await expect(open).toBeVisible();
    const href = (await open.getAttribute("href")) ?? "";
    expect(href).toContain("i.com.squareup.pos.TOTAL_AMOUNT=1000;");
    expect(href).toContain("S.com.squareup.pos.CLIENT_ID=sq0idp-e2e;");
    const code = /REQUEST_METADATA=(\w+);/.exec(href)?.[1] ?? "";

    // 取り消して戻ってきたとき
    await page.goto(
      "/staff/square?com.squareup.pos.ERROR_DESCRIPTION=取り消し",
    );
    await expect(page.getByRole("alert")).toContainText("取り消し");
    // 会計が済んで戻ってきたとき
    await page.goto(
      `/staff/square?com.squareup.pos.CLIENT_TRANSACTION_ID=tx1&com.squareup.pos.REQUEST_METADATA=${code}`,
    );
    await expect(page.getByRole("status")).toContainText("会計を記録しました");
    await page.goto(`/staff/o/${code}`);
    await expect(page.getByText("支払い済み")).toBeVisible();
    await expect(page.getByText("Square")).toBeVisible();
  });
});
