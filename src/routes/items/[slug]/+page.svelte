<script lang="ts">
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import Lightbox from "#lib/components/Lightbox.svelte";
  import Price from "#lib/components/Price.svelte";
  import ProductCard from "#lib/components/ProductCard.svelte";
  import {
    imageUrlOf,
    KIND_LABELS,
    MAX_COUNT,
    qtyField,
  } from "#lib/product.js";
  import "@anyblades/blades/content/code";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const product = $derived(data.product);
  const shop = $derived(data.shop);
  const images = $derived(product.images.map((n) => imageUrlOf(product, n)));
  // 見ている画像。商品が変わったら 1 枚目に戻す
  let current = $state(0);
  // 拡大表示中の番号。null なら閉じている
  let zoom = $state<number | null>(null);
  $effect(() => {
    void product.slug;
    current = 0;
    zoom = null;
  });

  const free = $derived(product.price === 0);
  const onSite = $derived(product.kind !== "download");
  // 送り直したときに入力を戻す
  const value = (name: string, fallback: string) =>
    form?.values?.[name] ?? fallback;
  const kindIcon: IconName = $derived(
    product.kind === "ticket"
      ? "ticket"
      : product.kind === "goods"
        ? "package"
        : "download",
  );
  const bigIcon: IconName = $derived(
    product.windowsOnly
      ? "monitor"
      : product.kind === "download"
        ? "file"
        : kindIcon,
  );
</script>

<svelte:head>
  <title>{product.name} | {shop.name}</title>
  <meta name="description" content={product.descriptionText.split("\n")[0]} />
</svelte:head>

{#snippet contact()}
  <div class="contact">
    <label class="field">
      <span class="lab">メールアドレス(注文ページのリンクを送ります)</span>
      <input
        name="email"
        type="email"
        autocomplete="email"
        required
        maxlength="200"
        value={value("email", "")}
      />
    </label>
    <label class="field">
      <span class="lab">お名前</span>
      <input
        name="name"
        autocomplete="name"
        required
        maxlength="100"
        value={value("name", "")}
      />
    </label>
  </div>
{/snippet}

<nav class="crumbs" aria-label="パンくず">
  <ul>
    <li><a href="/"><Icon name="home" size="1rem" />商品一覧</a></li>
    <li class="muted" aria-current="page">{product.name}</li>
  </ul>
</nav>

<div class="two">
  <figure class="shots">
    {#if images.length}
      <button
        type="button"
        class="zoom"
        onclick={() => {
          zoom = current;
        }}
        aria-label="画像を拡大する"
      >
        <img src={images[current] ?? images[0]} alt={product.name} />
        <span class="tag solid hint">
          <Icon name="zoom-in" size="1rem" />クリックで拡大
        </span>
      </button>
      {#if images.length > 1}
        <!-- サムネイル。JS が無ければ最初の 1 枚だけが出る -->
        <div class="thumbs">
          {#each images as src, i (src)}
            <button
              type="button"
              class="thumb {i === current ? 'on' : ''}"
              onclick={() => {
                current = i;
              }}
              aria-label="{i + 1} 枚目を見る"
              aria-pressed={i === current}
            >
              <img {src} alt="" loading="lazy" />
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="noshot">
        <Icon name={bigIcon} size="6rem" />
      </div>
    {/if}
  </figure>

  <div class="buyside">
    <div class="cluster">
      <span class="tag"
        ><Icon name={kindIcon} size="0.875rem" />{KIND_LABELS[
          product.kind
        ]}</span
      >
      {#if product.windowsOnly}
        <span class="tag info"
          ><Icon name="monitor" size="0.875rem" />Windows パソコン専用</span
        >
      {/if}
    </div>
    <h1>{product.name}</h1>
    <Price {product} large />

    <div class="panel sunk">
      <div class="in">
        {#if form?.error}
          <div role="alert" class="note err"><span>{form.error}</span></div>
        {/if}
        {#if product.available}
          <!-- 素の form。JS 無しでも動き、action の redirect で Stripe か注文ページへ飛ぶ -->
          <form
            method="POST"
            action={free ? "?/reserve" : "?/checkout"}
            class="stack"
          >
            {#if onSite}
              <fieldset class="qty">
                <legend class="lab">数量</legend>
                {#if product.variants.length === 0}
                  <label class="row">
                    <span>{product.name}</span>
                    <input
                      type="number"
                      name={qtyField(null)}
                      min="1"
                      max={MAX_COUNT}
                      inputmode="numeric"
                      value={value(qtyField(null), "1")}
                    />
                  </label>
                {:else}
                  {#each product.variants as v (v.id)}
                    <label class="row">
                      <span>{v.name}</span>
                      <input
                        type="number"
                        name={qtyField(v.id)}
                        min="0"
                        max={MAX_COUNT}
                        inputmode="numeric"
                        value={value(qtyField(v.id), "0")}
                      />
                    </label>
                  {/each}
                {/if}
              </fieldset>
            {/if}

            {#if free}
              {@render contact()}
              <button type="submit" class="buy big full">申し込む</button>
            {:else}
              <!-- 予約の欄(メール・お名前)は Checkout では要らないので、確かめずに送る -->
              <button
                type="submit"
                class="buy big full"
                formnovalidate
                disabled={!data.card}
              >
                購入する
              </button>
              {#if !data.card}
                <p class="small muted">オンラインでのお支払いは準備中です。</p>
              {/if}
              {#if product.payOnSite}
                <details class="fold" open={form?.reserving === true}>
                  <summary>当日払いで予約する(会場で現金)</summary>
                  <div class="inner stack">
                    <p class="small">
                      メールアドレスとお名前だけで予約できます。{product.kind ===
                      "ticket"
                        ? "入場"
                        : "受け取り"}のときに現金でお支払いください。
                    </p>
                    {@render contact()}
                    <button
                      type="submit"
                      formaction="?/reserve"
                      class="outline full">当日払いで予約する</button
                    >
                  </div>
                </details>
              {/if}
            {/if}
          </form>
          <ul class="perks">
            {#if product.kind === "download"}
              <li>
                <Icon
                  name="zap"
                  size="1rem"
                />お支払いが済むと、すぐメールでファイルをお届け
              </li>
            {:else}
              <li>
                <Icon name="scan" size="1rem" />{product.kind === "ticket"
                  ? "受付で、メールの注文ページの QR を見せて入場"
                  : "会場で、メールの注文ページの QR を見せて受け取り"}
              </li>
            {/if}
            {#if !free}
              <li>
                <Icon name="shield" size="1rem" />Stripe
                の決済ページへ移動します
              </li>
              <li>
                <Icon name="credit-card" size="1rem" />カード・Apple Pay・Google
                Pay など(コンビニ払い・銀行振込は入金確認後)
              </li>
            {/if}
            {#if product.windowsOnly}
              <li class="win">
                <Icon name="monitor" size="1rem" />Windows
                パソコンでのみ使えます。スマートフォンや Mac では開けません
              </li>
            {/if}
          </ul>
        {:else}
          <button type="button" class="big full" disabled>準備中</button>
          <p class="small muted">この商品はまだ販売を始めていません。</p>
        {/if}
      </div>
    </div>

    {#if product.files.length}
      <div>
        <h2 class="cap">お届けするファイル</h2>
        <ul class="files">
          {#each product.files as file (file)}
            <li>
              <Icon name="file" size="1rem" /><span class="brk">{file}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if shop.email}
      <p class="small muted">
        ご不明な点は、ご購入前に <a href="mailto:{shop.email}">{shop.email}</a> までお気軽に。
      </p>
    {/if}
  </div>
</div>

<section class="about">
  <h2>商品について</h2>
  <!-- サーバで sanitize 済み(richtext.ts)。平文で入っている説明も段落になって来る -->
  <div class="prose">{@html product.descriptionHtml}</div>
</section>

{#if data.others.length}
  <section class="others">
    <h2>他の商品</h2>
    <div class="pack">
      {#each data.others as other (other.slug)}
        <ProductCard product={other} />
      {/each}
    </div>
  </section>
{/if}

<Lightbox {images} alt={product.name} bind:index={zoom} />

<style>
  /* ---- パンくず ---- */
  .crumbs {
    margin-block: 0.5rem;
    font-size: 0.875rem;
  }
  .crumbs ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding-left: 0;
    list-style: none;
  }
  .crumbs li + li::before {
    content: "/";
    margin-right: 0.5rem;
    color: var(--nr-base-300);
  }
  .crumbs a {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* ---- 左に画像、右に買う所 ---- */
  .two {
    display: grid;
    gap: 2rem;
  }
  .shots {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  /* 押すと拡大。ボタンだが見た目は画像そのもの */
  .zoom {
    position: relative;
    display: block;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--nr-base-300);
    border-radius: var(--nr-radius-box);
    background: var(--nr-base-200);
    padding: 0;
    cursor: zoom-in;
  }
  .zoom img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: contain;
  }
  .hint {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    opacity: 0.8;
  }
  .zoom:hover .hint {
    opacity: 1;
  }
  .thumbs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .thumb {
    min-height: 0;
    overflow: hidden;
    border: 2px solid var(--nr-base-300);
    border-radius: var(--nr-radius-box);
    background: none;
    padding: 0;
    opacity: 0.7;
  }
  .thumb:hover {
    opacity: 1;
  }
  .thumb.on {
    border-color: var(--nr-primary);
    opacity: 1;
  }
  .thumb img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
  }
  /* 画像が 1 枚も無い商品 */
  .noshot {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 4 / 3;
    border: 1px solid var(--nr-base-300);
    border-radius: var(--nr-radius-box);
    background: color-mix(in oklch, var(--nr-primary) 5%, transparent);
    color: var(--nr-primary);
  }
  .noshot :global(svg) {
    opacity: 0.4;
  }

  .buyside {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .buyside h1 {
    font-size: 1.5rem;
    line-height: 1.4;
  }
  .panel .in {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
  }
  /* .full は app.css の button[type="submit"] { width: auto } より強く当てる */
  button.full {
    width: 100%;
  }
  .perks {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-left: 0;
    list-style: none;
    color: var(--nr-muted);
    font-size: 0.875rem;
  }
  .perks li {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .perks li :global(svg) {
    flex: none;
    margin-top: 0.15rem;
    color: var(--nr-secondary);
  }
  /* 動作環境の注意だけは青で、他の 3 つと役割を分ける */
  .perks li.win :global(svg) {
    color: var(--nr-info);
  }
  /* 数量。名前を左に、欄を右に */
  .qty {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    border: 0;
    padding: 0;
  }
  .qty .row {
    display: grid;
    grid-template-columns: 1fr 6rem;
    align-items: center;
    gap: 0.75rem;
  }
  .qty input {
    margin: 0;
  }
  .contact {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .cap {
    margin-bottom: 0.5rem;
    color: var(--nr-muted);
    font-size: 0.875rem;
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0;
    list-style: none;
    font-size: 0.875rem;
  }
  .files li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .files li :global(svg) {
    flex: none;
    color: var(--nr-primary);
  }
  /* 長いファイル名でも横に溢れさせない */
  .brk {
    word-break: break-all;
  }

  @media (width >= 40rem) {
    .thumbs {
      grid-template-columns: repeat(6, 1fr);
    }
    .buyside h1 {
      font-size: 1.875rem;
    }
  }
  @media (width >= 64rem) {
    .two {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
    /* 説明を読みながらでも買うボタンが見えるように、右側だけ貼り付ける */
    .buyside {
      position: sticky;
      top: 5rem;
      align-self: start;
    }
  }

  /* ---- 説明と他の商品 ---- */
  .about {
    margin-block: 2.5rem;
  }
  .about h2 {
    margin-bottom: 0.75rem;
    font-size: 1.25rem;
  }
  .others {
    margin-block: 3rem;
  }
  .others h2 {
    margin-bottom: 1rem;
    font-size: 1.25rem;
  }
  .pack {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (width >= 40rem) {
    .pack {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (width >= 64rem) {
    .pack {
      grid-template-columns: repeat(4, 1fr);
    }
  }
</style>
