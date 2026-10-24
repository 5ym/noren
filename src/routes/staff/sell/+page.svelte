<script lang="ts">
  import { enhance } from "$app/forms";

  import { counterField, MAX_COUNT, yen } from "#lib/product.js";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  // 欄の name → 数量。合計は目安として画面で出す(記録する金額はサーバが今の値段で出す)
  let counts = $state<Record<string, number>>({});
  const price = $derived(
    new Map(
      data.products.flatMap((p) =>
        (p.variants.length
          ? p.variants.map((v) => counterField(p.slug, v.id))
          : [counterField(p.slug, null)]
        ).map((k) => [k, p.price] as const),
      ),
    ),
  );
  const total = $derived(
    Object.entries(counts).reduce(
      (s, [k, n]) => s + (price.get(k) ?? 0) * n,
      0,
    ),
  );
  const set = (key: string, raw: string) => {
    const n = Math.floor(Number(raw));
    counts = {
      ...counts,
      [key]: Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(0, n)) : 0,
    };
  };
  const fields = (p: (typeof data.products)[number]) =>
    p.variants.length
      ? p.variants.map((v) => ({
          key: counterField(p.slug, v.id),
          label: v.name,
        }))
      : [{ key: counterField(p.slug, null), label: "数量" }];
  let busy = $state(false);

  // Square の会計待ちを作ったら、そのまま Square POS を開く(開かないときは下のボタン)
  $effect(() => {
    if (form?.square) location.href = form.square;
  });
</script>

<svelte:head>
  <title>当日販売 | スタッフ | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <a class="small" href="/staff">← スタッフ</a>
  <h1>当日販売</h1>
</div>

{#if form?.error}
  <div role="alert" class="note err top"><span>{form.error}</span></div>
{/if}
{#if form?.square}
  <div role="status" class="note warn top stack">
    <span
      >Square で {yen(form.amount)} を会計してください。会計が済むとこの画面に戻ります。</span
    >
    <a class="button" href={form.square}>Square POS を開く</a>
  </div>
{/if}

{#if data.products.length === 0}
  <p class="muted">会場で売る商品(物販・チケット)がありません。</p>
{:else}
  <form
    method="POST"
    action="?/cash"
    use:enhance={() => {
      busy = true;
      return async ({ update }) => {
        await update({ reset: false });
        busy = false;
      };
    }}
  >
    <div class="lineup">
      {#each data.products as p (p.slug)}
        <fieldset class="panel body">
          <legend
            >{p.name} <span class="muted small">{yen(p.price)}</span></legend
          >
          {#each fields(p) as f (f.key)}
            <label class="row">
              <span>{f.label}</span>
              <input
                type="number"
                name={f.key}
                min="0"
                max={MAX_COUNT}
                inputmode="numeric"
                value={counts[f.key] ?? 0}
                oninput={(e) => set(f.key, e.currentTarget.value)}
              />
            </label>
          {/each}
        </fieldset>
      {/each}
    </div>

    <div class="pay">
      <p class="total">合計 <strong class="nums">{yen(total)}</strong></p>
      <button type="submit" class="buy big" disabled={busy}
        >現金で受け取った</button
      >
      {#if data.square}
        <button
          type="submit"
          formaction="?/square"
          class="outline big"
          disabled={busy}>Square で会計</button
        >
      {/if}
    </div>
  </form>
{/if}

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
  .lineup {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 1rem;
  }
  fieldset {
    margin: 0;
  }
  legend {
    padding-inline: 0.25rem;
    font-weight: 700;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 6rem;
    align-items: center;
    gap: 0.75rem;
  }
  .row input {
    margin: 0;
  }
  /* 合計と会計のボタンは下に貼り付けて、スクロールしても手が届くように */
  .pay {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
    border-top: 1px solid var(--nr-base-300);
    background: var(--pico-background-color);
    padding-block: 0.75rem;
  }
  .total {
    margin-right: auto;
    font-size: 1.4rem;
  }
</style>
