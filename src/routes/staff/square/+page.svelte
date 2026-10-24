<script lang="ts">
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Square の会計 | スタッフ | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="doc stack">
  <h1>Square の会計</h1>
  {#if data.ok}
    <div role="status" class="note ok">
      <span>会計を記録しました。商品をお渡しください。</span>
    </div>
    <p class="cluster">
      <a class="button" href="/staff/sell">続けて売る</a>
      <a class="button outline" href="/staff/o/{data.code}">注文を見る</a>
    </p>
  {:else}
    <div role="alert" class="note err"><span>{data.message}</span></div>
    <p><a class="button" href="/staff/sell">当日販売に戻る</a></p>
  {/if}
</div>

<style>
  .doc {
    max-width: 36rem;
    margin-block: 2rem;
  }
</style>
