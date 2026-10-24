import { type APIRequestContext, expect, type Page } from "@playwright/test";
import Stripe from "stripe";

export const SIDE = "http://127.0.0.1:4174";
export const APP = "http://127.0.0.1:4173";

/**
 * ログインする。偽 IdP は画面を出さずにすぐ戻してくるので、行き先に着けばログイン済み。
 * role は偽 IdP が id_token に載せるロール(admin / staff / none)。
 */
export async function login(page: Page, role: "admin" | "staff" = "admin") {
  await page.request.post("/logout", {
    maxRedirects: 0,
    headers: { origin: APP },
  });
  await page.request.post(`${SIDE}/idp/role`, { data: role });
  await page.goto("/login");
  if (role === "admin") {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { name: "商品", exact: true }),
    ).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/staff$/);
    await expect(
      page.getByRole("heading", { name: "スタッフ", exact: true }),
    ).toBeVisible();
  }
}

/** 1x1 の PNG。画像のアップロードに使う */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const KIND_LABEL = {
  download: "ダウンロード商品",
  goods: "会場で受け取り",
  ticket: "入場チケット",
} as const;

/** 商品を作って、その編集ページに居る。 */
export async function createProduct(
  page: Page,
  slug: string,
  name: string,
  price = 500,
  kind: keyof typeof KIND_LABEL = "download",
) {
  await login(page);
  // 既にあれば編集ページへ。失敗したワーカーの立て直しで beforeAll が二度走っても通るように
  if ((await page.request.get(`/admin/${slug}`)).ok()) {
    await page.goto(`/admin/${slug}`);
    return;
  }
  await page.getByLabel(KIND_LABEL[kind]).check();
  await page.getByLabel(/^slug/).fill(slug);
  await page.getByLabel("商品名").fill(name);
  await page.getByLabel(/^価格/).fill(String(price));
  await page.getByRole("button", { name: "作成して編集へ" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${slug}$`));
}

/** 送るファイルを 1 つ入れる(MIME を持たない拡張子でも通ることの確認を兼ねる)。 */
export async function uploadFile(page: Page, name: string, body = "dummy") {
  await page.getByLabel("送るファイルを選ぶ").setInputFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(body),
  });
  await expect(page.locator("li").filter({ hasText: name })).toBeVisible();
}

/** 種類(サイズなど)を足す */
export async function addVariants(page: Page, names: string[]) {
  await page.getByLabel(/^種類を足す/).fill(names.join("\n"));
  await page.getByRole("button", { name: "足す", exact: true }).click();
  await expect
    .poll(() => variantNames(page))
    .toEqual(expect.arrayContaining(names));
}

/** 編集画面に並んでいる種類の名前 */
export const variantNames = (page: Page) =>
  page
    .getByLabel("種類の名前")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

export interface Mail {
  from: string;
  to: string[];
  subject: string;
  /** 本文(text/plain を base64 から戻したもの) */
  text: string;
  raw: string;
}
export const mails = async (request: APIRequestContext): Promise<Mail[]> =>
  (await request.get(`${SIDE}/mails`)).json();
export const clearMails = (request: APIRequestContext) =>
  request.delete(`${SIDE}/mails`);
export const posts = async (
  request: APIRequestContext,
): Promise<{ text: string }[]> => (await request.get(`${SIDE}/posts`)).json();
export const clearPosts = (request: APIRequestContext) =>
  request.delete(`${SIDE}/posts`);

/** メールの本文から注文ページの道(/orders/<token>)を取り出す */
export function orderPath(mail: Mail | undefined): string {
  const m = mail?.text.match(/http:\/\/127\.0\.0\.1:4173(\/orders\/[\w-]+)/);
  expect(m, "メールに注文ページのリンクがある").toBeTruthy();
  return (m as RegExpMatchArray)[1];
}

/** 届いたメールのうち、宛先が to の最後のもの */
export async function lastMailTo(request: APIRequestContext, to: string) {
  return (await mails(request)).filter((m) => m.to.includes(to)).at(-1);
}

const stripe = new Stripe("sk_test_dummy");

/** Stripe が送ってくる形の Webhook を、正しい署名付きで叩く。 */
export async function webhook(
  request: APIRequestContext,
  session: Record<string, unknown>,
  type = "checkout.session.completed",
  secret = "whsec_e2e",
) {
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type,
    data: { object: { object: "checkout.session", ...session } },
  });
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
  });
  return request.post("/api/stripe/webhook", {
    data: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
  });
}

export type Session = Record<string, unknown> & {
  id: string;
  success_url: string;
  amount_total: number;
};

/** 偽 Stripe の Session を書き換える(払ったことにする など)。書き換えた後の中身を返す */
export async function patchSession(
  request: APIRequestContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<Session> {
  return (
    await request.patch(`${SIDE}/stripe/sessions/${id}`, { data: patch })
  ).json();
}

/** いま開いている商品ページで「購入する」を押し、偽の決済画面に着いたら Session を返す */
export async function startCheckout(page: Page): Promise<Session> {
  await page.getByRole("button", { name: "購入する" }).click();
  await expect(page).toHaveURL(/\/stripe\/pay\/cs_test_/);
  const id = new URL(page.url()).pathname.split("/").at(-1) as string;
  return (await page.request.get(`${SIDE}/stripe/sessions/${id}`)).json();
}

export const buyer = {
  email: "buyer@example.test",
  name: "購入 太郎",
};

/** Checkout で払ったことにして Webhook を送る(カード)。Session を返す */
export async function payByCard(
  request: APIRequestContext,
  session: Session,
  customer = buyer,
): Promise<Session> {
  const paid = await patchSession(request, session.id, {
    payment_status: "paid",
    status: "complete",
    customer_details: customer,
  });
  const res = await webhook(request, paid);
  expect(await res.text()).toBe("delivered");
  return paid;
}
