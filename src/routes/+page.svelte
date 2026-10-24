<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import ProductCard from "#lib/components/ProductCard.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const shop = $derived(data.shop);

  // 並んでいる商品の種類に合わせて、届け方の説明を出し分ける
  const kinds = $derived(new Set(data.products.map((p) => p.kind)));

  const FEATURES = [
    {
      icon: "zap",
      title: "すぐ届く",
      text: "お支払いが済むと、その場でメールをお送りします",
    },
    {
      icon: "shield",
      title: "決済は Stripe",
      text: "カード番号は Stripe が扱い、当店には届きません。領収書も Stripe から届きます",
    },
    {
      icon: "scan",
      title: "会場では QR を見せるだけ",
      text: "グッズの受け取りもチケットの入場も、メールの注文ページの QR で",
    },
    {
      icon: "mail",
      title: "会員登録なし",
      text: "メールアドレスだけでご注文いただけます",
    },
  ] as const;
</script>

<section class="banner">
  <div class="inner">
    <div class="words">
      <h1>{shop.name}</h1>
      {#if shop.tagline}
        <p class="lead">{shop.tagline}</p>
      {/if}
      <ul class="points">
        <li><Icon name="check" size="1rem" />会員登録なし</li>
        <li><Icon name="check" size="1rem" />決済は Stripe</li>
        <li>
          <Icon name="check" size="1rem" />カード・Apple Pay・Google Pay など
        </li>
      </ul>
    </div>
    <!-- 3 つの種類(ダウンロード・グッズ・チケット)を重ねた絵 -->
    <svg viewBox="0 0 320 240" class="art" aria-hidden="true">
      <g transform="rotate(-8 160 130)">
        <rect
          x="60"
          y="40"
          width="130"
          height="170"
          rx="10"
          fill="#ffffff"
          opacity=".22"
        />
      </g>
      <rect x="90" y="30" width="130" height="170" rx="10" fill="#ffffff" />
      <rect
        x="90"
        y="30"
        width="130"
        height="30"
        rx="10"
        fill="var(--nr-secondary)"
      />
      <rect x="90" y="48" width="130" height="12" fill="var(--nr-secondary)" />
      <rect
        x="106"
        y="78"
        width="98"
        height="8"
        rx="4"
        fill="#1e3a5f"
        opacity=".8"
      />
      <rect
        x="106"
        y="96"
        width="76"
        height="6"
        rx="3"
        fill="#1e3a5f"
        opacity=".35"
      />
      <rect
        x="106"
        y="110"
        width="88"
        height="6"
        rx="3"
        fill="#1e3a5f"
        opacity=".35"
      />
      <!-- チケット -->
      <g transform="rotate(10 240 150)">
        <path
          d="M190 120h100a8 8 0 0 1 8 8v12a10 10 0 0 0 0 20v12a8 8 0 0 1-8 8H190a8 8 0 0 1-8-8v-12a10 10 0 0 0 0-20v-12a8 8 0 0 1 8-8z"
          fill="var(--nr-secondary)"
        />
        <path
          d="M250 124v52"
          stroke="#ffffff"
          stroke-width="3"
          stroke-dasharray="5 5"
        />
        <rect x="262" y="138" width="22" height="22" rx="3" fill="#ffffff" />
      </g>
      <!-- 受け取りの箱 -->
      <g transform="translate(118 150)">
        <path d="M0 18 36 0l36 18v40L36 76 0 58z" fill="#dbe7f5" />
        <path
          d="M0 18l36 18 36-18M36 36v40"
          stroke="#1e3a5f"
          stroke-width="3"
        />
      </g>
    </svg>
  </div>
</section>

<section class="feats">
  {#each FEATURES as f (f.title)}
    <div class="panel">
      <div class="feat">
        <span class="mark">
          <Icon name={f.icon} />
        </span>
        <div>
          <h2 class="h3">{f.title}</h2>
          <p class="small muted">{f.text}</p>
        </div>
      </div>
    </div>
  {/each}
</section>

<section id="products" class="shelf">
  <div class="head">
    <h2>商品一覧</h2>
    <span class="small muted">{data.products.length} 点</span>
  </div>
  {#if data.products.length}
    <div class="pack">
      {#each data.products as product (product.slug)}
        <ProductCard {product} />
      {/each}
    </div>
  {:else}
    <p class="muted">いま並んでいる商品はありません。</p>
  {/if}
</section>

<section class="flow">
  <h2>ご購入の流れ</h2>
  <ol class="trio">
    <li class="panel sunk">
      <div class="in">
        <div class="row">
          <span class="num">1</span>
          <Icon name="store" size="1.5rem" />
        </div>
        <h3>商品を選ぶ</h3>
        <p class="small muted">
          商品ページで数量や種類を選び、「購入する」から Stripe
          の決済ページへ進みます。
        </p>
      </div>
    </li>
    <li class="panel sunk">
      <div class="in">
        <div class="row">
          <span class="num">2</span>
          <Icon name="credit-card" size="1.5rem" />
        </div>
        <h3>お支払い</h3>
        <p class="small muted">
          カードのほか、決済ページに出る方法でお支払いいただけます。コンビニ払い・銀行振込は入金の確認後に次へ進みます。
        </p>
      </div>
    </li>
    <li class="panel sunk">
      <div class="in">
        <div class="row">
          <span class="num">3</span>
          <Icon name="mail" size="1.5rem" />
        </div>
        <h3>メールでお届け</h3>
        <p class="small muted">
          {#if kinds.has("download")}ダウンロード商品はファイルを添付したメールで。{/if}
          {#if kinds.has("goods") || kinds.has("ticket")}グッズとチケットは、メールの注文ページに出る
            QR を会場で見せてください。{/if}
          {#if kinds.size === 0}ご注文の内容をメールでお送りします。{/if}
        </p>
      </div>
    </li>
  </ol>
</section>

<section class="faq">
  <h2>よくある質問</h2>
  <div class="qs">
    <details class="fold">
      <summary>メールが届きません</summary>
      <div class="inner">
        迷惑メールのフォルダをご確認ください。数分経っても無い場合は{#if shop.email}、ご注文時のメールアドレスから
          <a href="mailto:{shop.email}">{shop.email}</a> へご連絡ください{:else}、お店へご連絡ください{/if}。
      </div>
    </details>
    <details class="fold">
      <summary>会場で QR コードを見せられないときは?</summary>
      <div class="inner">
        注文ページに出る 12
        文字の番号をスタッフにお伝えください。番号でも受け取り・入場ができます。
      </div>
    </details>
    <details class="fold">
      <summary>当日払いで予約できますか?</summary>
      <div class="inner">
        商品ページに「当日払いで予約」が出ている商品は、メールアドレスとお名前だけで予約できます。受け取りのときに現金でお支払いください。
      </div>
    </details>
    <details class="fold">
      <summary>領収書は出ますか?</summary>
      <div class="inner">
        お支払いが済むと Stripe
        から領収書のメールが届きます。注文のメールとは別の 1 通です。
      </div>
    </details>
  </div>
</section>

<style>
  /* ---- 最初の一枚。紺地に白 ---- */
  .banner {
    position: relative;
    margin-block: 1rem;
    overflow: hidden;
    border-radius: var(--nr-radius-box);
    background: var(--nr-banner);
    color: var(--nr-banner-content);
  }
  /* 単色だと平板なので、薄い格子を重ねる。画像ではなく CSS なので読み込みは無い */
  .banner::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      radial-gradient(
        circle at 85% 20%,
        rgba(255, 255, 255, 0.18),
        transparent 45%
      );
    background-size:
      28px 28px,
      28px 28px,
      100% 100%;
    pointer-events: none;
  }
  .banner .inner {
    position: relative;
    display: grid;
    align-items: center;
    gap: 2rem;
    padding: 2.5rem 1.5rem;
  }
  .words {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
  }
  .banner h1 {
    color: inherit;
    font-size: 2rem;
    line-height: 1.2;
  }
  /* 段落と並びは Blades が本文の色を付けるので、帯の白を引き継がせる (明るい表示で紺に暗い字になっていた) */
  .lead,
  .points {
    color: inherit;
  }
  .lead {
    max-width: var(--nr-page-width);
  }
  .points {
    display: flex;
    flex-wrap: wrap;
    column-gap: 1.25rem;
    row-gap: 0.5rem;
    padding-left: 0;
    list-style: none;
    font-size: 0.875rem;
  }
  .points li {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  /* 絵は横に余裕があるときだけ */
  .art {
    display: none;
  }
  @media (width >= 40rem) {
    .banner .inner {
      padding-inline: 2.5rem;
    }
    .banner h1 {
      font-size: 2.5rem;
    }
    .lead {
      font-size: 1.125rem;
    }
  }
  @media (width >= 64rem) {
    .banner .inner {
      grid-template-columns: 3fr 2fr;
      padding-block: 3.5rem;
    }
    .banner h1 {
      font-size: 3rem;
    }
    .art {
      display: block;
      width: 100%;
      max-width: 24rem;
      margin-inline: auto;
    }
  }

  /* ---- 安心材料の 4 点 ---- */
  .feats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-block: 1.5rem;
  }
  .feat {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
  }
  .h3 {
    font-size: 1.05rem;
  }
  .mark {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: color-mix(in oklch, var(--nr-primary) 12%, transparent);
    color: var(--nr-primary);
  }
  @media (width >= 64rem) {
    .feats {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* ---- 商品一覧 ---- */
  /* ヘッダーが固定なので、#products へ飛んだときに見出しが隠れないよう逃がす */
  .shelf {
    margin-block: 2.5rem;
    scroll-margin-top: 5rem;
  }
  .shelf .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .shelf h2,
  .flow h2,
  .faq h2 {
    font-size: 1.5rem;
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
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (width >= 80rem) {
    .pack {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* ---- ご購入の流れ ---- */
  .flow {
    margin-block: 3rem;
  }
  .flow h2 {
    margin-bottom: 1.25rem;
  }
  .trio {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    padding-left: 0;
    list-style: none;
  }
  .trio .in {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
  }
  .trio .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .trio .row :global(svg) {
    color: var(--nr-primary);
  }
  .num {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    background: var(--nr-primary);
    color: var(--nr-primary-content);
    font-size: 1.125rem;
    font-weight: 700;
  }
  .trio h3 {
    font-size: 1.125rem;
  }
  @media (width >= 40rem) {
    .trio {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* ---- よくある質問 ---- */
  .faq {
    max-width: var(--nr-page-width);
    margin-block: 3rem;
  }
  .faq h2 {
    margin-bottom: 1rem;
  }
  .qs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>
