<script lang="ts">
  import { enhance } from "$app/forms";
  import { refreshAll } from "$app/navigation";
  import { untrack } from "svelte";

  import RichTextEditor from "#lib/components/RichTextEditor.svelte";
  import { imageUrl, imageUrlOf, KIND_LABELS, yen } from "#lib/product.js";
  import "@anyblades/blades/content/code";
  import "@anyblades/blades/forms/input-file";
  import "@anyblades/blades/components/progress";
  import type { PageProps } from "./$types";

  // 公開ページ(/items/[slug])と同じ並びで、その場所をそのまま編集する。
  // 見た目は公開ページに寄せてあるので、保存前にどう見えるかがだいたい分かる。
  let { data, form }: PageProps = $props();
  const product = $derived(data.product);

  // フォームの値。保存するまで product には反映されない
  // 初期値としてだけ data を読む(untrack)。保存が通ると invalidate で data は
  // 新しくなるが、入力中の値をそれで上書きしない
  const initial = untrack(() => data.product);
  let name = $state(initial.name);
  let price = $state(String(initial.price));
  let listPrice = $state(
    initial.listPrice === null ? "" : String(initial.listPrice),
  );
  let windowsOnly = $state(initial.windowsOnly);
  let payOnSite = $state(initial.payOnSite);
  let active = $state(initial.active);
  let sortOrder = $state(String(initial.sortOrder));

  let saving = $state(false);
  let saved = $state(false);
  let imageForm: HTMLFormElement | undefined = $state();

  // ファイルは PUT で 1 つずつ流す(サーバ側の説明は files/[name]/+server.ts)。
  // fetch には送信の進捗が無いので XMLHttpRequest。数百 MB〜数 GB のカタログを送る間、
  // 何 % まで行ったかと、詰まったときに止める手段が要る。
  let uploading = $state<
    | {
        name: string;
        index: number;
        count: number;
        loaded: number;
        total: number;
      }
    | undefined
  >();
  let uploadError = $state<string | undefined>();
  let fileInput: HTMLInputElement | undefined = $state();
  // XMLHttpRequest は $state に入れない(クラスのインスタンスを proxy にしない)
  let currentXhr: XMLHttpRequest | undefined;

  const fmt = (bytes: number) =>
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
      : bytes >= 1024 ** 2
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`;

  function put(file: File, index: number, count: number) {
    return new Promise<{ ok: boolean; message: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      currentXhr = xhr;
      xhr.open(
        "PUT",
        `/admin/${product.slug}/files/${encodeURIComponent(file.name)}`,
      );
      // .ISO のようにブラウザが MIME を知らない拡張子は file.type が空。adapter-node のころは
      // content-type の無いリクエストの本文が null になったので、必ず付ける
      xhr.setRequestHeader(
        "content-type",
        file.type || "application/octet-stream",
      );
      uploading = {
        name: file.name,
        index,
        count,
        loaded: 0,
        total: file.size,
      };
      xhr.upload.onprogress = (e) => {
        if (uploading && e.lengthComputable)
          uploading = { ...uploading, loaded: e.loaded, total: e.total };
      };
      xhr.onload = () =>
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          message: xhr.responseText.slice(0, 200),
        });
      xhr.onerror = () => resolve({ ok: false, message: "通信に失敗しました" });
      xhr.onabort = () => resolve({ ok: false, message: "中止しました" });
      xhr.send(file);
    });
  }

  async function upload(files: FileList) {
    uploadError = undefined;
    const list = [...files];
    for (const [i, file] of list.entries()) {
      const res = await put(file, i + 1, list.length);
      if (!res.ok) {
        uploadError = `${file.name}: ${res.message}`;
        break;
      }
    }
    uploading = undefined;
    currentXhr = undefined;
    if (fileInput) fileInput.value = "";
    await refreshAll();
  }

  const priceNum = $derived(Number(price) || 0);
  const listNum = $derived(listPrice === "" ? null : Number(listPrice) || 0);
  const discounted = $derived(listNum !== null && listNum > priceNum);
</script>

<svelte:head>
  <title>{product.name} | 管理 | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="crumb">
  <a class="small" href="/admin">← 商品一覧</a>
  <span class="sep">/</span>
  <span class="slug">{product.slug}</span>
  <div class="grow"></div>
  {#if !product.active}
    <span class="tag">非公開</span>
  {:else if product.available}
    <span class="tag ok">販売中</span>
  {:else}
    <span class="tag warn">準備中(ファイル無し)</span>
  {/if}
  <a class="button ghost mini" href="/items/{product.slug}" target="_blank"
    >公開ページを見る ↗</a
  >
</div>

{#if form?.error}
  <div role="alert" class="note err top"><span>{form.error}</span></div>
{/if}

<!-- 商品情報。公開ページの左に画像、右に名前・価格・説明、という並びをそのまま使う -->
<form
  method="POST"
  action="?/update"
  class="edit"
  use:enhance={() => {
    saving = true;
    saved = false;
    return async ({ update, result }) => {
      await update({ reset: false });
      saving = false;
      saved = result.type === "success";
    };
  }}
>
  <div class="left">
    <!-- 画像。1 枚目が代表(一覧のカードと商品ページのメイン)。並べ替えは ← → -->
    {#if imageUrl(product)}
      <img src={imageUrl(product)} alt="" class="rep" />
    {:else}
      <div class="rep none">画像なし</div>
    {/if}
    {#if product.images.length}
      <ul class="pics">
        {#each product.images as name, i (name)}
          <li class="pic">
            <img
              src={imageUrlOf(product, name)}
              alt=""
              class="sq {i === 0 ? 'first' : ''}"
            />
            {#if i === 0}<span class="tag solid mark">代表</span>{/if}
            <!-- form の中に form は置けないので、ボタンは外の隠しフォームに form= で結ぶ。
						     押したボタンの name/value がそのフォームと一緒に送られる -->
            <div class="ops">
              <button
                type="submit"
                form="move-prev-form"
                name="name"
                value={name}
                class="ghost"
                disabled={i === 0}
                title="前へ">←</button
              >
              <button
                type="submit"
                form="remove-image-form"
                name="name"
                value={name}
                class="danger"
                title="外す">✕</button
              >
              <button
                type="submit"
                form="move-next-form"
                name="name"
                value={name}
                class="ghost"
                disabled={i === product.images.length - 1}
                title="後ろへ">→</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <label class="pick">
      画像を追加(複数可)
      <input
        type="file"
        accept="image/*"
        multiple
        form="image-form"
        name="image"
        onchange={() => imageForm?.requestSubmit()}
      />
    </label>
    <p class="tiny muted">
      JPEG / PNG / WebP / GIF / AVIF、1 枚 5MB まで、12 枚まで。1
      枚目が代表になります。
    </p>
  </div>

  <div class="right">
    <input
      name="name"
      class="title"
      required
      placeholder="商品名"
      bind:value={name}
    />

    <div class="prices">
      <label class="field">
        <span class="lab">価格(税込・円)</span>
        <label class="money">
          <span class="yen">¥</span>
          <input
            name="price"
            type="number"
            min="0"
            step="1"
            required
            bind:value={price}
          />
        </label>
      </label>
      <label class="field">
        <span class="lab">通常価格(取り消し線で出す。空なら無し)</span>
        <label class="money sm">
          <span class="yen">¥</span>
          <input
            name="listPrice"
            type="number"
            min="0"
            step="1"
            bind:value={listPrice}
          />
        </label>
      </label>
      {#if discounted}
        <span class="tag secondary"
          >{Math.round((1 - priceNum / (listNum ?? 1)) * 100)}%OFF と出ます</span
        >
      {/if}
    </div>

    <!-- 札は公開ページと同じ場所に、押せる形で -->
    <div class="cluster">
      <span class="tag">{KIND_LABELS[product.kind]}</span>
      {#if product.kind === "download"}
        <label class="tag pill {windowsOnly ? 'info' : 'off'}">
          <input
            type="checkbox"
            name="windowsOnly"
            bind:checked={windowsOnly}
          />
          Windows パソコン専用
        </label>
      {:else}
        <label class="tag pill {payOnSite ? 'info' : 'off'}">
          <input type="checkbox" name="payOnSite" bind:checked={payOnSite} />
          当日払いの予約を受ける
        </label>
      {/if}
      <label class="tag pill {active ? 'ok' : 'off'}">
        <input type="checkbox" name="active" bind:checked={active} />
        {active ? "公開中" : "非公開"}
      </label>
      {#each product.files as file (file)}
        <span class="tag">{file}</span>
      {/each}
    </div>

    <div class="field">
      <span class="lab">説明</span>
      <RichTextEditor value={product.descriptionHtml} />
    </div>

    <label class="field narrow">
      <span class="lab">並び順(小さいほど先)</span>
      <input
        name="sortOrder"
        type="number"
        min="0"
        step="1"
        bind:value={sortOrder}
      />
    </label>
  </div>

  <!-- 保存は下に固定。スクロールしても手が届く -->
  <div class="savebar">
    <div class="in">
      <button type="submit" disabled={saving}>
        {#if saving}<span class="spin"></span>{/if}
        保存
      </button>
      {#if saved}
        <span class="small done">保存しました</span>
      {/if}
      <div class="grow"></div>
      <span class="small muted"
        >{yen(priceNum)}{discounted ? ` (通常 ${yen(listNum ?? 0)})` : ""}</span
      >
    </div>
  </div>
</form>

<!-- 画像の送信と削除は別フォーム。上の入力(name など)を巻き込まない -->
<form
  id="image-form"
  bind:this={imageForm}
  method="POST"
  action="?/image"
  enctype="multipart/form-data"
  class="gone"
  use:enhance
></form>
<form
  id="remove-image-form"
  method="POST"
  action="?/removeImage"
  class="gone"
  use:enhance
></form>
<form
  id="move-prev-form"
  method="POST"
  action="?/moveImage"
  class="gone"
  use:enhance
>
  <input type="hidden" name="dir" value="-1" />
</form>
<form
  id="move-next-form"
  method="POST"
  action="?/moveImage"
  class="gone"
  use:enhance
>
  <input type="hidden" name="dir" value="1" />
</form>

<div class="bottom">
  {#if product.kind === "download"}
    <section class="col">
      <h2>送るファイル</h2>
      <p class="small muted">
        決済後にここにあるファイルを全部、購入者にメールで送ります(合計 20MB
        までは添付、それ以上はリンクのみ)。 1
        つも無い間は「準備中」で買えません。
      </p>
      <ul class="files">
        {#each product.files as file (file)}
          <li>
            <span class="tag">{file}</span>
            <form method="POST" action="?/removeFile" use:enhance>
              <input type="hidden" name="file" value={file} />
              <button type="submit" class="ghost mini">削除</button>
            </form>
          </li>
        {:else}
          <li class="small muted">まだありません</li>
        {/each}
      </ul>
      <input
        bind:this={fileInput}
        type="file"
        multiple
        aria-label="送るファイルを選ぶ"
        disabled={uploading !== undefined}
        onchange={() => {
          if (fileInput?.files?.length) upload(fileInput.files);
        }}
      />
      {#if uploading}
        {@const pct = uploading.total
          ? Math.floor((uploading.loaded / uploading.total) * 100)
          : 0}
        <div class="prog">
          <div class="row">
            <span class="cut">
              {#if uploading.count > 1}<span class="muted"
                  >{uploading.index} / {uploading.count}</span
                >{/if}
              {uploading.name}
            </span>
            <span class="pct">{pct}%</span>
          </div>
          <progress value={pct} max="100"></progress>
          <div class="row dim">
            <span>
              {fmt(uploading.loaded)} / {fmt(uploading.total)}
              {#if pct >= 100}<span class="wait"
                  ><span class="spin"></span> サーバで保存しています</span
                >{/if}
            </span>
            <button
              type="button"
              class="ghost mini"
              onclick={() => currentXhr?.abort()}>中止</button
            >
          </div>
        </div>
      {/if}
      {#if uploadError}
        <div role="alert" class="note err"><span>{uploadError}</span></div>
      {/if}
    </section>
  {:else}
    <section class="col">
      <h2>種類</h2>
      <p class="small muted">
        サイズ・色、大人・子どもなど。種類があると、注文のときに種類ごとに数量を選びます。
        価格は商品で 1
        つです(値段の違うものは別の商品に)。消しても、これまでの注文には名前が残ります。
      </p>
      <ul class="variants">
        {#each product.variants as v, i (v.id)}
          <li>
            <form
              method="POST"
              action="?/renameVariant"
              use:enhance
              class="cluster grow"
            >
              <input type="hidden" name="id" value={v.id} />
              <input
                name="name"
                value={v.name}
                aria-label="種類の名前"
                required
                maxlength="40"
                class="grow"
              />
              <button type="submit" class="ghost mini">名前を保存</button>
            </form>
            <form method="POST" action="?/moveVariant" use:enhance>
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="dir" value="-1" />
              <button
                type="submit"
                class="ghost mini"
                disabled={i === 0}
                aria-label="{v.name} を前へ"
                title="前へ">↑</button
              >
            </form>
            <form method="POST" action="?/moveVariant" use:enhance>
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="dir" value="1" />
              <button
                type="submit"
                class="ghost mini"
                disabled={i === product.variants.length - 1}
                aria-label="{v.name} を後ろへ"
                title="後ろへ">↓</button
              >
            </form>
            <form method="POST" action="?/removeVariant" use:enhance>
              <input type="hidden" name="id" value={v.id} />
              <button
                type="submit"
                class="danger mini"
                aria-label="{v.name} を消す">消す</button
              >
            </form>
          </li>
        {:else}
          <li class="small muted">種類はありません(数量だけを選びます)</li>
        {/each}
      </ul>
      <form
        method="POST"
        action="?/addVariants"
        use:enhance={() =>
          async ({ update }) =>
            update()}
        class="stack"
      >
        <label class="field">
          <span class="lab">種類を足す(1 行に 1 つ。例: S、M、L)</span>
          <textarea name="names" rows="3"></textarea>
        </label>
        <button type="submit" class="outline mini self">足す</button>
      </form>
    </section>
  {/if}

  <section class="col">
    <h2>この商品について</h2>
    <dl class="info">
      <dt class="muted">URL</dt>
      <dd>
        <a href="/items/{product.slug}" target="_blank">/items/{product.slug}</a
        >
      </dd>
      <dt class="muted">作成</dt>
      <dd>{new Date(product.createdAt).toLocaleString("ja-JP")}</dd>
      <dt class="muted">更新</dt>
      <dd>{new Date(product.updatedAt).toLocaleString("ja-JP")}</dd>
    </dl>
    <details class="fold bad">
      <summary>削除</summary>
      <div class="inner">
        <p class="small muted">
          行もファイルも消えます。売った履歴は残ります。確認のため slug(<code
            >{product.slug}</code
          >)を入力してください。
        </p>
        <form method="POST" action="?/remove" class="cluster">
          <input name="confirm" placeholder={product.slug} autocomplete="off" />
          <button type="submit" class="mini">この商品を削除</button>
        </form>
      </div>
    </details>
  </section>
</div>

<style>
  /* ---- 上のパンくず ---- */
  .crumb {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-block: 1rem;
    font-size: 0.875rem;
  }
  .sep {
    color: var(--nr-base-300);
  }
  .slug {
    color: var(--nr-muted);
    font-family: monospace;
  }
  .note.top {
    margin-bottom: 1rem;
  }

  /* ---- 商品情報の編集 ---- */
  .edit {
    display: flex;
    max-width: 64rem;
    flex-direction: column;
    gap: 1.5rem;
    margin-inline: auto;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .rep {
    width: 100%;
    aspect-ratio: 16 / 10;
    border: 1px solid var(--nr-base-300);
    border-radius: var(--nr-radius-box);
    object-fit: cover;
  }
  .rep.none {
    display: grid;
    place-items: center;
    background: var(--nr-base-200);
    color: var(--nr-muted);
    font-size: 0.875rem;
  }
  .pics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
    padding-left: 0;
    list-style: none;
  }
  .pic {
    position: relative;
  }
  .sq {
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid var(--nr-base-300);
    border-radius: 0.25rem;
    object-fit: cover;
  }
  .sq.first {
    border-color: var(--nr-primary);
  }
  .mark {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    padding: 0 0.35rem;
    font-size: 0.65rem;
  }
  /* 並べ替え・削除は、その画像に触ったときだけ出す */
  .ops {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    justify-content: space-between;
    background: color-mix(in srgb, var(--nr-surface) 90%, transparent);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .pic:hover .ops,
  .ops:focus-within {
    opacity: 1;
  }
  .ops button {
    min-height: 1.5rem;
    padding: 0 0.25rem;
    font-size: 0.75rem;
  }
  /* label をボタンに見せる(中の input は隠す) */
  .pick {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    border: var(--pico-border-width) solid var(--pico-primary-border);
    border-radius: var(--pico-border-radius);
    background: transparent;
    padding: 0.15rem 0.6rem;
    color: var(--pico-primary);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
  .pick input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .right {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1rem;
  }
  /* 商品名は公開ページの見出しと同じ大きさで、枠は触ったときだけ */
  .title {
    width: 100%;
    border-color: transparent;
    background: transparent;
    padding-inline: 0.5rem;
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.4;
  }
  .title:hover {
    border-color: var(--pico-form-element-border-color);
  }
  .prices {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    column-gap: 1.5rem;
    row-gap: 0.75rem;
  }
  .money {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    border: var(--pico-border-width) solid var(--pico-form-element-border-color);
    border-radius: var(--pico-border-radius);
    background: var(--pico-form-element-background-color);
    padding-inline: var(--pico-form-element-spacing-horizontal);
    font-size: 1.875rem;
    font-weight: 700;
  }
  .money input {
    width: 8rem;
    flex: 1 1 auto;
    margin: 0;
    border: 0;
    background: transparent;
    padding: 0.25rem 0;
    font-size: inherit;
    font-weight: inherit;
  }
  .money .yen {
    color: var(--nr-muted);
    font-size: 1rem;
  }
  .money.sm {
    font-size: 0.925rem;
  }
  .money.sm input {
    width: 7rem;
  }
  .money.sm .yen {
    font-size: inherit;
  }
  /* 押せる札。中のチェックは小さく */
  .pill {
    gap: 0.5rem;
    cursor: pointer;
  }
  /* 外れている札は破線の枠で。薄くすると文字が読みにくくなる */
  .pill.off {
    border-style: dashed;
    border-color: var(--nr-muted);
  }
  .pill input {
    width: 0.85rem;
    height: 0.85rem;
    margin: 0;
  }
  .narrow {
    width: 10rem;
  }

  /* ---- 下に貼り付く保存バー ---- */
  .savebar {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 10;
    border-top: 1px solid var(--nr-base-300);
    background: color-mix(in srgb, var(--nr-surface) 95%, transparent);
    backdrop-filter: blur(6px);
  }
  .savebar .in {
    display: flex;
    max-width: 64rem;
    align-items: center;
    gap: 0.75rem;
    margin-inline: auto;
    padding: 0.75rem 1rem;
  }
  .done {
    color: var(--nr-success);
  }
  .gone {
    display: none;
  }

  @media (width >= 40rem) {
    .edit {
      flex-direction: row;
    }
    .left {
      width: 16rem;
      flex: none;
    }
    .rep {
      aspect-ratio: 1;
    }
  }

  /* ---- 下half: ファイルと情報 ---- */
  .bottom {
    display: grid;
    gap: 2rem;
    max-width: 64rem;
    margin-inline: auto;
    /* 固定の保存バーに隠れないよう、下に大きめの余白 */
    margin-top: 2.5rem;
    margin-bottom: 7rem;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .col h2 {
    font-size: 1.125rem;
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0;
    list-style: none;
  }
  .files li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .variants {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-left: 0;
    list-style: none;
  }
  .variants li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .variants input {
    min-width: 6rem;
  }
  .self {
    align-self: flex-start;
  }
  .prog {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }
  .prog .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .prog .row.dim {
    color: var(--nr-muted);
  }
  .prog progress {
    width: 100%;
  }
  /* 長いファイル名は 1 行に収めて、% を右端に残す */
  .cut {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pct {
    white-space: nowrap;
    font-family: monospace;
  }
  .wait {
    margin-left: 0.5rem;
  }
  .info {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 1rem;
    row-gap: 0.25rem;
    font-size: 0.875rem;
  }
  /* 削除は赤枠で、他の操作と間違えないように */
  .bad {
    border-color: color-mix(in oklch, var(--nr-error) 40%, transparent);
  }
  .bad > summary {
    color: var(--nr-error);
  }
  .bad .inner {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bad button[type="submit"] {
    border-color: var(--nr-error);
    background: var(--nr-error);
    color: var(--nr-error-content);
  }

  @media (width >= 40rem) {
    .bottom {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
