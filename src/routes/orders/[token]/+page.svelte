<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import OrderItems from "#lib/components/OrderItems.svelte";
  import { handWord, methodLabel, STATUS } from "#lib/order.js";
  import { yen } from "#lib/product.js";
  import "@anyblades/blades/layered/content/code";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const order = $derived(data.order);
  const st = $derived(STATUS[order.status]);
  const word = $derived(handWord(order));
  const when = (ms: number) =>
    new Date(ms).toLocaleString("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    });
</script>

<svelte:head>
  <title>ご注文 | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="doc stack">
  <h1>ご注文</h1>

  {#if data.fresh}
    <div class="note ok" role="status">
      <span
        >{order.status === "unpaid"
          ? "ご予約"
          : "お申し込み"}を承りました。{order.email}
        宛にこのページのリンクをお送りしました。</span
      >
    </div>
  {/if}

  <p class="cluster">
    <span class="tag lg {st.cls}">{st.label}</span>
    {#if order.handedAt !== null}
      <span class="tag lg ok">{word}済み</span>
    {/if}
    <span class="small muted">{when(order.createdAt)} のご注文</span>
  </p>

  {#if data.qr}
    <section class="panel body ticket">
      <h2>{word}用の QR コード</h2>
      {#if order.handedAt !== null}
        <p>
          この注文は {when(order.handedAt)} に{word}済みです。
        </p>
      {:else}
        <p>
          {word}のときに、この画面を会場のスタッフにお見せください。
          {#if order.status === "unpaid"}
            <strong
              >{word}のときに、現金で {yen(order.amount)} をお支払いください。</strong
            >
          {/if}
        </p>
      {/if}
      <!-- サーバで作った SVG(中身はスタッフ画面の URL だけ) -->
      <div class="qr" role="img" aria-label="{word}用の QR コード">
        {@html data.qr}
      </div>
      <p class="small">
        QR が読めないときは番号をお伝えください: <code class="code"
          >{order.code}</code
        >
      </p>
    </section>
  {:else if order.status === "pending"}
    <div class="note warn">
      <span
        >お支払いの確認を待っています。{#if order.expiresAt}{when(
            order.expiresAt,
          )}
          までに{/if}お支払いください。入金が確認できるとメールをお送りします。</span
      >
    </div>
  {:else if order.status === "failed" || order.status === "expired"}
    <div class="note err">
      <span>この注文はお支払いが無いまま終わりました。</span>
    </div>
  {/if}

  {#if data.downloads.length}
    <section class="panel body">
      <h2>ダウンロード</h2>
      {#if data.expired}
        <p class="muted">ダウンロードの期限が切れています。</p>
      {:else}
        <ul class="files">
          {#each data.downloads as d (d.href)}
            <li>
              <Icon name="download" size="1rem" />
              <a href={d.href} download>{d.file}</a>
            </li>
          {/each}
        </ul>
        {#if data.downloadUntil}
          <p class="small muted">{when(data.downloadUntil)} まで有効です。</p>
        {/if}
      {/if}
    </section>
  {/if}

  <section class="stack">
    <h2>ご注文の内容</h2>
    <OrderItems items={order.items} amount={order.amount} />
    <dl class="info small">
      <dt class="muted">お名前</dt>
      <dd>{order.name ?? "—"}</dd>
      <dt class="muted">メール</dt>
      <dd>{order.email ?? "—"}</dd>
      <dt class="muted">お支払い</dt>
      <dd>{methodLabel(order.method)}</dd>
    </dl>
  </section>

  <p class="small muted">
    このページの URL
    を知っている人は誰でも注文を見られます。人に送らないでください。
    {#if data.shop.email}ご不明な点は
      <a href="mailto:{data.shop.email}">{data.shop.email}</a> まで。{/if}
  </p>
</div>

<style>
  .doc {
    max-width: 36rem;
    margin-inline: auto;
    margin-block: 2rem;
  }
  .doc h2 {
    font-size: 1.15rem;
  }
  .ticket {
    align-items: center;
    text-align: center;
  }
  /* QR は暗い画面でも白地に黒(読み取りやすさを優先) */
  .qr {
    width: min(18rem, 100%);
    border-radius: var(--pico-border-radius);
    background: #fff;
    line-height: 0;
  }
  .qr :global(svg) {
    width: 100%;
    height: auto;
  }
  .code {
    font-size: 1.1rem;
    letter-spacing: 0.08em;
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-left: 0;
    list-style: none;
  }
  .files li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    word-break: break-all;
  }
  .info {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 1rem;
    row-gap: 0.25rem;
  }
</style>
