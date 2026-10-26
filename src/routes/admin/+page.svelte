<script lang="ts">
  import { KIND_LABELS, KINDS, yen } from "#lib/product.js";
  import "@anyblades/blades/content/table";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const kindHelp = {
    download: "決済のあとファイルをメールで送る",
    goods: "会場で受け取る。サイズなどの種類を付けられる",
    ticket: "受付で QR を見せて入場。大人・子どもなどの種類を付けられる",
  } as const;
</script>

<svelte:head>
  <title>管理 | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <h1>商品</h1>
  <span class="small muted">{data.name}</span>
  <div class="grow"></div>
  <a class="button ghost mini" href="/admin/orders">
    注文
    {#if data.pending > 0}
      <span class="tag warn">入金待ち {data.pending}</span>
    {/if}
  </a>
  <a class="button ghost mini" href="/admin/settings">お店の設定</a>
  <a class="button ghost mini" href="/staff">スタッフ画面</a>
  <form method="POST" action="/logout">
    <button type="submit" class="ghost mini">ログアウト</button>
  </form>
</div>

<div class="scroll-x">
  <table>
    <thead>
      <tr><th>並び</th><th>商品</th><th>種類</th><th>価格</th><th>状態</th></tr>
    </thead>
    <tbody>
      {#each data.products as p (p.slug)}
        <tr>
          <td>{p.sortOrder}</td>
          <td>
            <a href="/admin/{p.slug}">{p.name}</a>
            <div class="tiny muted">{p.slug}</div>
          </td>
          <td class="nw">
            {KIND_LABELS[p.kind]}
            <div class="tiny muted">
              {#if p.kind === "download"}
                ファイル {p.files.length}
              {:else if p.variants.length}
                {p.variants.map((v) => v.name).join("・")}
              {/if}
            </div>
          </td>
          <td class="nw">{yen(p.price)}</td>
          <td>
            {#if !p.active}
              <span class="tag">非公開</span>
            {:else if p.available}
              <span class="tag ok">販売中</span>
            {:else}
              <span class="tag warn">準備中(ファイル無し)</span>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="5" class="muted">商品はまだありません</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<h2 class="add">商品を追加</h2>
{#if form?.error}
  <div role="alert" class="note err"><span>{form.error}</span></div>
{/if}
<!-- 作ってから編集画面へ。slug は URL とフォルダ名、種類は届け方を決めるので、あとから変えられない -->
<form method="POST" action="?/create" class="make">
  <fieldset class="kinds">
    <legend class="lab">種類(あとから変えられない)</legend>
    {#each KINDS as kind (kind)}
      <label class="check">
        <input
          type="radio"
          name="kind"
          value={kind}
          checked={(form?.kind ?? "download") === kind}
        />
        <span
          >{KIND_LABELS[kind]}
          <span class="tiny muted">{kindHelp[kind]}</span></span
        >
      </label>
    {/each}
  </fieldset>
  <label class="field">
    <span class="lab">slug(URL: /items/ここ。英小文字・数字・ハイフン)</span>
    <input
      name="slug"
      required
      pattern="[a-z0-9][a-z0-9\-]*"
      value={form?.slug ?? ""}
    />
  </label>
  <label class="field">
    <span class="lab">商品名</span>
    <input name="name" required value={form?.name ?? ""} />
  </label>
  <label class="field">
    <span class="lab">価格(税込・円。0 なら決済なしの申し込み)</span>
    <input
      name="price"
      type="number"
      min="0"
      step="1"
      required
      value={form?.price ?? ""}
    />
  </label>
  <button type="submit" class="self">作成して編集へ</button>
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
  .nw {
    white-space: nowrap;
  }
  .add {
    margin-top: 2.5rem;
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
  }
  .note {
    margin-bottom: 0.75rem;
  }
  .make {
    display: flex;
    max-width: 36rem;
    flex-direction: column;
    gap: 0.75rem;
  }
  .kinds {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    border: 0;
    padding: 0;
  }
  /* 作成ボタンだけ幅いっぱいにしない */
  .self {
    align-self: flex-start;
  }
</style>
