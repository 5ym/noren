import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import Stripe from "stripe";

import { CODE, codeFromScan, handWord, needsHanding } from "../src/lib/order";
import { reserve } from "../src/lib/server/checkout";
import db from "../src/lib/server/db";
import { resolveDownload } from "../src/lib/server/download";
import type { Message } from "../src/lib/server/mail";
import {
  addVariants,
  createProduct,
  deleteProduct,
  getProduct,
  saveFile,
} from "../src/lib/server/products";
import {
  attachSession,
  awaitingHand,
  countPending,
  createOrder,
  getOrder,
  hand,
  listOrders,
  type NewItem,
  orderBySession,
  settleSquare,
  unhand,
} from "../src/lib/server/purchase";
import { randomCode } from "../src/lib/server/random";
import {
  contactFromForm,
  itemsFromCounterForm,
  itemsFromProductForm,
  SelectionError,
} from "../src/lib/server/selection";
import { siteOrigin } from "../src/lib/server/site";
import { handleWebhook } from "../src/lib/server/webhook";

const ORIGIN = "https://shop.example.test";
const view = (slug: string) =>
  getProduct(slug) as NonNullable<ReturnType<typeof getProduct>>;

/** 送ったメールを溜める偽の送信 */
const outbox: Message[] = [];
const send = async (m: Message) => {
  outbox.push(m);
};

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const stripe = new Stripe("sk_test_dummy");
async function event(
  session: Record<string, unknown>,
  type = "checkout.session.completed",
) {
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type,
    data: { object: { object: "checkout.session", ...session } },
  });
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: "whsec_test_secret",
  });
  const res = await handleWebhook(payload, signature, ORIGIN, send);
  return { status: res.status, text: await res.text() };
}

/** Checkout を作ったときと同じ形の注文(決済前)と、それに付く Session の骨 */
function checkout(items: NewItem[], sessionId: string) {
  const order = createOrder({
    channel: "online",
    method: "stripe",
    status: "open",
    items,
  });
  attachSession(order.id, sessionId);
  return {
    order,
    session: (overrides: Record<string, unknown> = {}) => ({
      id: sessionId,
      payment_status: "paid",
      amount_total: order.amount,
      currency: "jpy",
      payment_method_types: ["card"],
      customer_details: { email: "buyer@example.test", name: "購入 太郎" },
      metadata: { order: String(order.id), origin: ORIGIN },
      ...overrides,
    }),
  };
}

beforeAll(async () => {
  createProduct({ slug: "o-dl", name: "資料", price: 800 });
  await saveFile("o-dl", "guide.pdf", new Blob(["pdf bytes"]));
  createProduct({
    slug: "o-shirt",
    name: "シャツ",
    price: 2000,
    kind: "goods",
  });
  addVariants("o-shirt", "S\nM");
  createProduct({ slug: "o-pin", name: "バッジ", price: 300, kind: "goods" });
  createProduct({
    slug: "o-ticket",
    name: "入場券",
    price: 1000,
    kind: "ticket",
  });
  db().run(
    "UPDATE product SET payOnSite = 1 WHERE slug IN ('o-shirt', 'o-ticket')",
  );
  createProduct({ slug: "o-free", name: "無料の資料", price: 0 });
  await saveFile("o-free", "free.txt", new Blob(["free"]));
});
afterAll(() => {
  for (const s of ["o-dl", "o-shirt", "o-pin", "o-ticket", "o-free"])
    deleteProduct(s);
});

describe("数量の入力", () => {
  test("ダウンロード商品は 1 点、種類の無い物販は qty(無ければ 1)、種類ごとは qty-<id>", () => {
    expect(
      itemsFromProductForm(form({ qty: "5" }), view("o-dl")),
    ).toMatchObject([
      { productSlug: "o-dl", count: 1, price: 800, kind: "download" },
    ]);
    expect(itemsFromProductForm(form({}), view("o-pin"))).toMatchObject([
      { count: 1 },
    ]);
    expect(
      itemsFromProductForm(form({ qty: "3" }), view("o-pin")),
    ).toMatchObject([{ count: 3, variantId: null }]);
    const [s, m] = view("o-shirt").variants;
    expect(
      itemsFromProductForm(
        form({ [`qty-${s.id}`]: "0", [`qty-${m.id}`]: "2" }),
        view("o-shirt"),
      ),
    ).toMatchObject([{ variantId: m.id, variantName: "M", count: 2 }]);
    for (const bad of [
      {},
      { [`qty-${s.id}`]: "-1" },
      { [`qty-${s.id}`]: "1.5" },
      { [`qty-${s.id}`]: "100" },
    ]) {
      expect(() => itemsFromProductForm(form(bad), view("o-shirt"))).toThrow(
        SelectionError,
      );
    }
  });

  test("当日販売はまとめて読み、ダウンロード商品は売らない", () => {
    const [s] = view("o-shirt").variants;
    const items = itemsFromCounterForm(
      form({ [`q:o-shirt:${s.id}`]: "2", "q:o-pin": "1", "q:o-dl": "1" }),
      [view("o-shirt"), view("o-pin"), view("o-dl")],
    );
    expect(items.map((i) => [i.productSlug, i.count])).toEqual([
      ["o-shirt", 2],
      ["o-pin", 1],
    ]);
    expect(() => itemsFromCounterForm(form({}), [view("o-pin")])).toThrow(
      /1 つ以上/,
    );
  });

  test("予約の連絡先はメールと名前が要る", () => {
    expect(contactFromForm(form({ email: "a@b.cd", name: " 山田 " }))).toEqual({
      email: "a@b.cd",
      name: "山田",
    });
    expect(() => contactFromForm(form({ email: "nope", name: "x" }))).toThrow();
    expect(() =>
      contactFromForm(form({ email: "a@b.cd", name: "" })),
    ).toThrow();
  });
});

describe("番号", () => {
  test("QR の番号は読み違えやすい文字を含まない 12 文字。URL からも取り出せる", () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(CODE);
    const code = randomCode();
    expect(codeFromScan(code)).toBe(code);
    expect(codeFromScan(` ${code}\n`)).toBe(code);
    expect(codeFromScan(`https://other.example/staff/o/${code}`)).toBe(code);
    expect(codeFromScan(`https://x.example/orders/${code}`)).toBeNull();
    expect(codeFromScan("O0O0O0O0O0O0")).toBeNull();
    expect(codeFromScan("hello")).toBeNull();
  });
});

describe("会場での受け渡し", () => {
  test("支払い済みは 1 回だけ渡せる。取り消すと戻る", () => {
    const o = createOrder({
      channel: "online",
      method: "card",
      status: "paid",
      email: "a@example.test",
      items: itemsFromProductForm(form({}), view("o-pin")),
    });
    expect(needsHanding(o)).toBe(true);
    expect(handWord(o)).toBe("受け取り");
    expect(awaitingHand("goods").some((x) => x.id === o.id)).toBe(true);
    expect(hand(o.id, "スタッフ A", true)).toBe(false); // 当日払いではない
    expect(hand(o.id, "スタッフ A")).toBe(true);
    expect(hand(o.id, "スタッフ B")).toBe(false);
    expect(getOrder(o.id)).toMatchObject({ handedBy: "スタッフ A" });
    expect(awaitingHand("goods").some((x) => x.id === o.id)).toBe(false);
    expect(unhand(o.id)).toBe(true);
    expect(unhand(o.id)).toBe(false);
    expect(getOrder(o.id)?.handedAt).toBeNull();
  });

  test("当日払いの未払いは、代金を受けたときに支払い済み・入場済みになる", () => {
    const o = createOrder({
      channel: "online",
      method: "cash",
      status: "unpaid",
      email: "b@example.test",
      items: itemsFromProductForm(form({ qty: "2" }), view("o-ticket")),
    });
    expect(handWord(o)).toBe("入場");
    expect(o.amount).toBe(2000);
    expect(hand(o.id, "受付")).toBe(false);
    expect(hand(o.id, "受付", true)).toBe(true);
    expect(getOrder(o.id)).toMatchObject({ status: "paid", handedBy: "受付" });
    expect(getOrder(o.id)?.paidAt).not.toBeNull();
  });

  test("Square の当日販売は会計待ちから、戻ってきたときに済む", () => {
    const o = createOrder({
      channel: "counter",
      method: "square",
      status: "pending",
      items: itemsFromProductForm(form({}), view("o-pin")),
    });
    // 店の入金待ち(オンライン)には数えない
    const before = countPending();
    expect(settleSquare(o.id, "レジ")).toBe(true);
    expect(settleSquare(o.id, "レジ")).toBe(false);
    expect(getOrder(o.id)).toMatchObject({ status: "paid", handedBy: "レジ" });
    expect(countPending()).toBe(before);
  });
});

describe("Webhook", () => {
  test("署名が無い・合わないものは 400", async () => {
    expect((await handleWebhook("{}", null, ORIGIN, send)).status).toBe(400);
    expect((await handleWebhook("{}", "t=1,v1=x", ORIGIN, send)).status).toBe(
      400,
    );
  });

  test("カード: 支払い済みにして、客(ファイル添付 + 注文ページ)と店にメール。二度目は送らない", async () => {
    outbox.length = 0;
    const { order, session } = checkout(
      itemsFromProductForm(form({}), view("o-dl")),
      "cs_test_card",
    );
    expect(await event(session())).toEqual({ status: 200, text: "delivered" });
    const after = getOrder(order.id);
    expect(after).toMatchObject({
      status: "paid",
      method: "card",
      email: "buyer@example.test",
    });
    expect(after?.mailedAt).not.toBeNull();
    const [buyer, shop] = outbox;
    expect(buyer.to).toBe("buyer@example.test");
    expect(buyer.subject).toContain("資料 をお送りします");
    expect(buyer.attachments?.map((a) => a.filename)).toEqual(["guide.pdf"]);
    expect(buyer.text).toContain(`${ORIGIN}/orders/${order.token}`);
    expect(buyer.text).toContain(`${ORIGIN}/dl/${order.token}/o-dl/guide.pdf`);
    expect(shop.to).toBe("shop@example.test");
    expect(shop.text).toContain("cs_test_card");

    expect(await event(session())).toEqual({
      status: 200,
      text: "already delivered",
    });
    expect(outbox).toHaveLength(2);
  });

  test("物販: メールには注文ページのリンクと QR の案内(添付は無い)", async () => {
    outbox.length = 0;
    const [, m] = view("o-shirt").variants;
    const { order, session } = checkout(
      itemsFromProductForm(form({ [`qty-${m.id}`]: "2" }), view("o-shirt")),
      "cs_test_goods",
    );
    expect((await event(session())).text).toBe("delivered");
    expect(outbox[0].subject).toContain("ご注文を承りました");
    expect(outbox[0].attachments).toEqual([]);
    expect(outbox[0].text).toContain("QR コード");
    expect(outbox[0].text).toContain("シャツ(M) × 2");
    expect(awaitingHand("goods").some((x) => x.id === order.id)).toBe(true);
  });

  test("コンビニ: 入金待ちで記録し、入金で納品。決済画面のまま失効したものは一覧に出さない", async () => {
    outbox.length = 0;
    const before = countPending();
    const { order, session } = checkout(
      itemsFromProductForm(form({}), view("o-ticket")),
      "cs_test_konbini",
    );
    expect(
      await event(
        session({
          payment_status: "unpaid",
          payment_method_types: ["konbini"],
        }),
      ),
    ).toEqual({ status: 200, text: "not paid yet" });
    expect(getOrder(order.id)).toMatchObject({
      status: "pending",
      method: "konbini",
    });
    expect(countPending()).toBe(before + 1);
    expect(outbox).toHaveLength(0);
    // 入金待ちは会場で渡せない
    expect(hand(order.id, "受付")).toBe(false);

    expect(
      (
        await event(
          session({ payment_method_types: ["konbini"] }),
          "checkout.session.async_payment_succeeded",
        )
      ).text,
    ).toBe("delivered");
    expect(getOrder(order.id)?.status).toBe("paid");
    expect(outbox).toHaveLength(2);
    // 支払い済みのあとに失効が来ても戻らない
    await event(session(), "checkout.session.expired");
    expect(getOrder(order.id)?.status).toBe("paid");

    // 別の注文は入金されずに終わる
    const bank = checkout(
      itemsFromProductForm(form({}), view("o-ticket")),
      "cs_test_bank",
    );
    await event(
      bank.session({
        payment_status: "unpaid",
        payment_method_types: ["customer_balance"],
      }),
    );
    expect(
      (await event(bank.session(), "checkout.session.async_payment_failed"))
        .text,
    ).toBe("failed");
    expect(getOrder(bank.order.id)?.status).toBe("failed");
    expect(listOrders().some((o) => o.id === bank.order.id)).toBe(true);

    // 決済画面を開いただけで失効
    const open = checkout(
      itemsFromProductForm(form({}), view("o-ticket")),
      "cs_test_open",
    );
    await event(open.session(), "checkout.session.expired");
    expect(getOrder(open.order.id)?.status).toBe("expired");
    expect(listOrders().some((o) => o.id === open.order.id)).toBe(false);
  });

  test("注文の見つからない決済は 200 で止める", async () => {
    expect(
      await event({
        id: "cs_test_ghost",
        payment_status: "paid",
        customer_details: { email: "x@example.test" },
        metadata: { order: "999999" },
      }),
    ).toEqual({ status: 200, text: "unresolvable session" });
    expect(orderBySession("cs_test_ghost")).toBeNull();
  });

  test("メールが送れなければ 500(Stripe が再送する)", async () => {
    const { session } = checkout(
      itemsFromProductForm(form({}), view("o-pin")),
      "cs_test_mailfail",
    );
    const payload = JSON.stringify({
      id: "evt_fail",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { object: "checkout.session", ...session() } },
    });
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: "whsec_test_secret",
    });
    const res = await handleWebhook(payload, signature, ORIGIN, async () => {
      throw new Error("SMTP down");
    });
    expect(res.status).toBe(500);
    expect(orderBySession("cs_test_mailfail")?.mailedAt).toBeNull();
  });
});

describe("予約と申し込み(Stripe を通さない)", () => {
  test("当日払いの予約は未払いで記録し、注文ページのリンクを送る", async () => {
    outbox.length = 0;
    const o = await reserve(
      view("o-shirt"),
      itemsFromProductForm(
        form({ [`qty-${view("o-shirt").variants[0].id}`]: "1" }),
        view("o-shirt"),
      ),
      { email: "r@example.test", name: "予約 花子" },
      ORIGIN,
      send,
    );
    expect(o).toMatchObject({ status: "unpaid", method: "cash" });
    expect(outbox[0].subject).toContain("ご予約を承りました");
    expect(outbox[0].text).toContain("現金で ¥2,000");
    expect(outbox[0].text).toContain(`/orders/${o.token}`);
    expect(getOrder(o.id)?.mailedAt).not.toBeNull();
  });

  test("当日払いを受けない商品・ダウンロード商品は予約できない。無料は申し込める", async () => {
    await expect(
      reserve(
        view("o-pin"),
        itemsFromProductForm(form({}), view("o-pin")),
        { email: "r@example.test", name: "x" },
        ORIGIN,
        send,
      ),
    ).rejects.toThrow(SelectionError);
    outbox.length = 0;
    const o = await reserve(
      view("o-free"),
      itemsFromProductForm(form({}), view("o-free")),
      { email: "f@example.test", name: "無料 太郎" },
      ORIGIN,
      send,
    );
    expect(o).toMatchObject({ status: "paid", method: "free", amount: 0 });
    expect(outbox[0].attachments?.map((a) => a.filename)).toEqual(["free.txt"]);
  });

  test("メールが送れなくても予約は残る", async () => {
    const o = await reserve(
      view("o-ticket"),
      itemsFromProductForm(form({}), view("o-ticket")),
      { email: "r@example.test", name: "x" },
      ORIGIN,
      async () => {
        throw new Error("SMTP down");
      },
    );
    expect(getOrder(o.id)).toMatchObject({ status: "unpaid", mailedAt: null });
  });
});

describe("ダウンロード", () => {
  test("支払い済みの注文の、その商品のファイルだけ。期限は支払った日から", () => {
    const items = itemsFromProductForm(form({}), view("o-dl"));
    const paid = createOrder({
      channel: "online",
      method: "card",
      status: "paid",
      email: "d@example.test",
      items,
    });
    expect(resolveDownload(paid.token, "o-dl", "guide.pdf")).toHaveProperty(
      "path",
    );
    expect(resolveDownload(paid.token, "o-dl", "nope.pdf")).toEqual({
      status: 404,
    });
    expect(resolveDownload(paid.token, "o-free", "free.txt")).toEqual({
      status: 404,
    });
    expect(resolveDownload("nope", "o-dl", "guide.pdf")).toEqual({
      status: 404,
    });
    const pending = createOrder({
      channel: "online",
      method: "konbini",
      status: "pending",
      email: "d@example.test",
      items,
    });
    expect(resolveDownload(pending.token, "o-dl", "guide.pdf")).toEqual({
      status: 404,
    });
    db().run("UPDATE purchase SET paidAt = ? WHERE id = ?", [
      Date.now() - 31 * 86_400_000,
      paid.id,
    ]);
    expect(resolveDownload(paid.token, "o-dl", "guide.pdf")).toEqual({
      status: 410,
    });
  });
});

describe("レビューで足したもの", () => {
  test("同じイベントが同時に 2 回届いても、メールは 1 回", async () => {
    outbox.length = 0;
    const { session } = checkout(
      itemsFromProductForm(form({}), view("o-pin")),
      "cs_test_concurrent",
    );
    const results = await Promise.all([event(session()), event(session())]);
    expect(results.map((r) => r.text).sort()).toEqual([
      "already delivered",
      "delivered",
    ]);
    expect(outbox.filter((m) => m.to === "buyer@example.test")).toHaveLength(1);
  });

  test("メールが送れなかったら送る権利を戻し、次の再送で送れる", async () => {
    const { order, session } = checkout(
      itemsFromProductForm(form({}), view("o-pin")),
      "cs_test_retry",
    );
    const payload = JSON.stringify({
      id: "evt_retry",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { object: "checkout.session", ...session() } },
    });
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: "whsec_test_secret",
    });
    const failed = await handleWebhook(payload, signature, ORIGIN, async () => {
      throw new Error("SMTP down");
    });
    expect(failed.status).toBe(500);
    expect(getOrder(order.id)?.mailedAt).toBeNull();
    expect((await event(session())).text).toBe("delivered");
  });

  test("同じアドレスの予約は 1 時間に 5 件まで", async () => {
    const reserveOnce = () =>
      reserve(
        view("o-ticket"),
        itemsFromProductForm(form({}), view("o-ticket")),
        { email: "Flood@Example.test", name: "x" },
        ORIGIN,
        send,
      );
    for (let i = 0; i < 5; i++) await reserveOnce();
    await expect(reserveOnce()).rejects.toThrow(/予約が続いています/);
  });

  test("PUBLIC_URL があれば、リンクの origin はリクエストの Host ではなくそれ", () => {
    const req = new URL("https://evil.example/items/x");
    expect(siteOrigin(req)).toBe("https://evil.example");
    process.env.PUBLIC_URL = "https://shop.example.test/";
    try {
      expect(siteOrigin(req)).toBe("https://shop.example.test");
    } finally {
      process.env.PUBLIC_URL = "";
    }
  });
});
