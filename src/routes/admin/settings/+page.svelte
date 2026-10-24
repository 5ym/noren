<script lang="ts">
  import { enhance } from "$app/forms";

  import RichTextEditor from "#lib/components/RichTextEditor.svelte";
  import { TOKUSHOHO_ROWS } from "#lib/shop.js";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const shop = $derived(data.shop);
  let saving = $state(false);
</script>

<svelte:head>
  <title>お店の設定 | 管理 | {shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <a class="small" href="/admin">← 商品</a>
  <h1>お店の設定</h1>
</div>

{#if form?.error}
  <div role="alert" class="note err top"><span>{form.error}</span></div>
{:else if form?.ok}
  <div role="status" class="note ok top"><span>保存しました</span></div>
{/if}

<form
  method="POST"
  class="stack"
  use:enhance={() => {
    saving = true;
    return async ({ update }) => {
      await update({ reset: false });
      saving = false;
    };
  }}
>
  <section class="stack">
    <h2>お店</h2>
    <label class="field">
      <span class="lab">店の名前(タイトルとメールの件名に出ます)</span>
      <input name="name" required maxlength="60" value={shop.name} />
    </label>
    <label class="field">
      <span class="lab">一言(トップの見出しの下と足元)</span>
      <textarea name="tagline" rows="2" maxlength="300">{shop.tagline}</textarea
      >
    </label>
    <label class="field">
      <span class="lab"
        >問い合わせ先のメールアドレス(足元・特定商取引法の表記・メールの末尾。空なら出しません)</span
      >
      <input name="email" type="email" maxlength="200" value={shop.email} />
    </label>
    <label class="field">
      <span class="lab">運営者の名前(空なら出しません)</span>
      <input name="owner" maxlength="60" value={shop.owner} />
    </label>
    <label class="field">
      <span class="lab"
        >リンク(1 行に「ラベル https://…」。足元とお店についてに並びます)</span
      >
      <textarea name="links" rows="3"
        >{shop.links.map((l) => `${l.label} ${l.href}`).join("\n")}</textarea
      >
    </label>
  </section>

  <section class="stack">
    <h2>お店について(/about)</h2>
    <RichTextEditor
      value={shop.aboutHtml}
      name="aboutHtml"
      label="お店についての本文"
    />
  </section>

  <section class="stack">
    <h2>特定商取引法に基づく表記(/tokushoho)</h2>
    <p class="small muted">
      空にした行は出しません。連絡先には上の問い合わせ先が出ます。
    </p>
    {#each TOKUSHOHO_ROWS as [key, label] (key)}
      <label class="field">
        <span class="lab">{label}</span>
        <textarea name="tokushoho.{key}" rows="2" maxlength="1000"
          >{shop.tokushoho[key]}</textarea
        >
      </label>
    {/each}
  </section>

  <div>
    <button type="submit" disabled={saving}>
      {#if saving}<span class="spin"></span>{/if}
      保存
    </button>
  </div>
</form>

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
  .top {
    margin-bottom: 1rem;
  }
  form {
    max-width: 48rem;
    padding-bottom: 3rem;
  }
  h2 {
    font-size: 1.125rem;
  }
</style>
