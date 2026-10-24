<script lang="ts">
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const shop = $derived(data.shop);
</script>

<svelte:head>
  <title>お店について | {shop.name}</title>
</svelte:head>

<!-- 本文は管理画面の「お店の設定」で書く(保存時に sanitize 済み)。連絡先と運営者は設定の値から -->
<div class="prose doc">
  <h1>{shop.name}について</h1>
  {@html shop.aboutHtml}

  {#if shop.email || shop.owner || shop.links.length}
    <h2>運営と連絡先</h2>
    {#if shop.owner}
      <p>運営: {shop.owner}</p>
    {/if}
    {#if shop.email}
      <p>
        お問い合わせは <a href="mailto:{shop.email}">{shop.email}</a> までどうぞ。
      </p>
    {/if}
    {#if shop.links.length}
      <ul>
        {#each shop.links as link (link.href)}
          <li>
            <a href={link.href} rel="noopener me" target="_blank"
              >{link.label}</a
            >
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  <p>
    事業者情報は <a href="/tokushoho">特定商取引法に基づく表記</a> をご覧ください。
  </p>
</div>

<style>
  /* 読む幅(.prose)を真ん中に置くだけ */
  .doc {
    margin-inline: auto;
    margin-block: 2rem;
  }
</style>
