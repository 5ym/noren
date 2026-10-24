<script lang="ts">
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>ご購入ありがとうございます | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="prose doc">
  <h1>ご購入ありがとうございます</h1>
  {#if data.paid}
    <p>
      {#if data.email}<strong>{data.email}</strong> 宛に{/if}ご注文の内容と注文ページのリンクをメールでお送りします。
      ダウンロード商品はファイルも添付しています。
    </p>
    {#if data.token}
      <p><a class="button" href="/orders/{data.token}">注文ページを開く</a></p>
    {:else}
      <p class="small muted">
        注文ページの準備ができるまで少しかかることがあります。メールのリンクから開いてください。
      </p>
    {/if}
    <p class="small">
      数分経ってもメールが届かない場合は、迷惑メールのフォルダをご確認ください。
      {#if data.shop.email}それでも無いときは
        <a href="mailto:{data.shop.email}">{data.shop.email}</a> までご連絡ください。{/if}
    </p>
  {:else}
    <p>
      お支払いの確認が取れ次第、{#if data.email}<strong>{data.email}</strong> 宛に{/if}注文ページのリンクをメールでお送りします。
    </p>
  {/if}
  <p><a href="/">一覧に戻る</a></p>
</div>

<style>
  /* 読む幅(.prose)を真ん中に置くだけ */
  .doc {
    margin-inline: auto;
    margin-block: 2rem;
  }
</style>
