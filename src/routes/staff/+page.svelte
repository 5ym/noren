<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>スタッフ | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <h1>スタッフ</h1>
  <span class="small muted">{data.name}</span>
  <div class="grow"></div>
  <form method="POST" action="/logout">
    <button type="submit" class="ghost mini">ログアウト</button>
  </form>
</div>

<ul class="menu">
  <li>
    <a class="panel tile" href="/staff/scan">
      <Icon name="scan" size="2rem" />
      <span class="big">QR を読む</span>
      <span class="small muted">受け取り・入場。番号の入力もここ</span>
    </a>
  </li>
  <li>
    <a class="panel tile" href="/staff/sell">
      <Icon name="banknote" size="2rem" />
      <span class="big">当日販売</span>
      <span class="small muted"
        >会場で売る(現金{data.square ? "・Square" : ""})</span
      >
    </a>
  </li>
  <li>
    <a class="panel tile" href="/staff/list?kind=goods">
      <Icon name="package" size="2rem" />
      <span class="big">受け取り待ち</span>
      <span class="small muted">{data.goods} 件</span>
    </a>
  </li>
  <li>
    <a class="panel tile" href="/staff/list?kind=ticket">
      <Icon name="ticket" size="2rem" />
      <span class="big">入場前</span>
      <span class="small muted">{data.tickets} 件</span>
    </a>
  </li>
</ul>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-block: 1.5rem;
  }
  .bar h1 {
    font-size: 1.5rem;
  }
  .menu {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 1rem;
    padding-left: 0;
    list-style: none;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    height: 100%;
    padding: 1.25rem;
    color: inherit;
    text-decoration: none;
  }
  .tile:hover {
    border-color: var(--nr-primary);
  }
  .tile :global(svg) {
    color: var(--nr-primary);
  }
  .big {
    font-size: 1.2rem;
    font-weight: 700;
  }
</style>
