<script lang="ts">
  import { browser } from "$app/env";
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { page, updated } from "$app/state";

  import Icon from "#lib/components/Icon.svelte";
  import "../app.css";

  let { children, data } = $props();
  const shop = $derived(data.shop);

  // A rolling update replaces the hashed asset filenames, so a tab opened before
  // the deploy asks for chunks the new pods no longer have. Without this a click
  // on a link just dies; instead we hand the navigation over to the browser,
  // which reloads the page against whichever version is live now.
  let staleAssets = false;
  let pending: string | undefined;

  beforeNavigate(({ willUnload, to }) => {
    if (willUnload || !to?.url) return;
    pending = to.url.href;
    // `updated` flips once the version poll configured in vite.config.ts sees a
    // new build.
    if (staleAssets || updated.current) location.href = to.url.href;
  });

  afterNavigate(() => {
    pending = undefined;
  });

  if (browser) {
    // Vite fires this when a lazily imported chunk 404s, which happens if the
    // poll has not run yet or the request reached a pod that was already
    // replaced. Hovering a link preloads code too, so only take over when a
    // navigation is actually in flight -- otherwise just remember for the next
    // click rather than reloading the page under the user.
    addEventListener("vite:preloadError", (event) => {
      event.preventDefault();
      staleAssets = true;
      if (pending) location.href = pending;
    });
  }

  const NAV = [
    { href: "/", label: "商品一覧" },
    { href: "/about", label: "お店について" },
    {
      href: "/tokushoho",
      label: "特定商取引法に基づく表記",
      narrowHidden: true,
    },
  ];
</script>

<svelte:head>
  <title>{shop.name}</title>
  {#if shop.tagline}
    <meta name="description" content={shop.tagline} />
  {/if}
</svelte:head>

<div class="site">
  <!-- 店の色を最初に見せる帯。ヘッダー自体は白で読みやすさ優先 -->
  <div class="band"></div>
  <header class="bar">
    <nav class="page inner">
      <a class="logo" href="/">
        <!-- favicon と同じ暖簾 -->
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <rect x="5" y="7" width="22" height="2.5" rx="1.25" fill="#fff" />
          <rect x="6" y="10.5" width="5.5" height="15" rx="1" fill="#fff" />
          <rect x="13.25" y="10.5" width="5.5" height="15" rx="1" fill="#fff" />
          <rect x="20.5" y="10.5" width="5.5" height="15" rx="1" fill="#fff" />
        </svg>
        {shop.name}
      </a>
      <div class="grow"></div>
      {#if data.role}
        <a class="button outline mini" href="/staff">スタッフ</a>
      {/if}
      {#if data.role === "admin"}
        <a class="button outline mini" href="/admin">管理</a>
      {/if}
      {#each NAV as item (item.href)}
        <a
          class="button ghost mini {item.narrowHidden ? 'wide-only' : ''}"
          aria-current={page.url.pathname === item.href ? "page" : undefined}
          href={item.href}>{item.label}</a
        >
      {/each}
    </nav>
  </header>
  <main class="page grow">
    {@render children()}
  </main>
  <!-- 誰の店か・どこで確かめられるか・どう連絡するかを全ページの足元に置く。
       中身は管理画面の「お店の設定」 -->
  <footer class="foot">
    <div class="page cols">
      <div>
        <span class="name">{shop.name}</span>
        {#if shop.tagline}
          <p class="small">{shop.tagline}</p>
        {/if}
      </div>
      <div class="links">
        <span class="head">ご案内</span>
        <a href="/about">お店について</a>
        <a href="/tokushoho">特定商取引法に基づく表記</a>
        {#if shop.email}
          <a class="mail" href="mailto:{shop.email}">
            <Icon name="mail" />{shop.email}
          </a>
        {/if}
      </div>
      {#if shop.owner || shop.links.length}
        <div class="links">
          {#if shop.owner}
            <span class="head">運営 {shop.owner}</span>
          {/if}
          <div class="cluster">
            {#each shop.links as link (link.href)}
              <a
                class="button outline mini onnavy"
                href={link.href}
                rel="noopener me"
                target="_blank">{link.label}</a
              >
            {/each}
          </div>
        </div>
      {/if}
    </div>
    <div class="copy">
      <p class="page tiny">© {shop.name}{shop.owner ? ` ${shop.owner}` : ""}</p>
    </div>
  </footer>
</div>

<style>
  .site {
    display: flex;
    min-height: 100vh;
    flex-direction: column;
  }
  .band {
    height: 6px;
    background: linear-gradient(
      to right,
      var(--nr-primary),
      var(--nr-secondary),
      var(--nr-primary)
    );
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 30;
    border-bottom: 1px solid var(--nr-base-300);
    background: color-mix(in srgb, var(--nr-surface) 90%, transparent);
    backdrop-filter: blur(6px);
  }
  .bar .inner {
    display: flex;
    min-height: 3.5rem;
    align-items: center;
    gap: 0.25rem;
    padding-block: 0.25rem;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0;
    color: var(--nr-primary);
    font-size: 1.25rem;
    font-weight: 700;
    text-decoration: none;
  }
  .logo svg {
    width: 1.75rem;
    height: 1.75rem;
    flex: none;
  }
  main {
    padding-bottom: 3rem;
  }
  @media (width < 40rem) {
    .wide-only {
      display: none;
    }
  }

  /* 足元。紺地に白 */
  .foot {
    margin-top: 2rem;
    background: var(--nr-banner);
    color: var(--nr-banner-content);
  }
  .foot .cols {
    display: grid;
    gap: 2rem;
    padding-block: 2.5rem;
  }
  @media (width >= 40rem) {
    .foot .cols {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  /* Pico は p に地の文字色を付けるので、紺地の上では親の白を引き継がせる */
  .foot p {
    color: inherit;
  }
  .foot .name {
    display: block;
    margin-bottom: 0.75rem;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .foot .links {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  .foot .head {
    font-weight: 700;
  }
  .foot a {
    color: inherit;
    text-decoration: none;
  }
  .foot a:hover {
    text-decoration: underline;
  }
  .foot .mail {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  /* 紺地の上のボタンは、枠も字も白で */
  .foot .onnavy {
    border-color: color-mix(in srgb, var(--nr-banner-content) 40%, transparent);
    color: var(--nr-banner-content);
  }
  .foot .onnavy:hover {
    background: var(--nr-banner-content);
    color: var(--nr-banner);
  }
  .copy {
    border-top: 1px solid
      color-mix(in srgb, var(--nr-banner-content) 20%, transparent);
  }
  .copy p {
    padding-block: 0.75rem;
  }
</style>
