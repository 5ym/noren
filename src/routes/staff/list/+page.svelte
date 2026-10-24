<script lang="ts">
  import { refreshAll } from "$app/navigation";

  import { itemLabel, STATUS } from "#lib/order.js";
  import { yen } from "#lib/product.js";
  import "@anyblades/blades/layered/content/table";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const title = $derived(data.kind === "ticket" ? "入場前" : "受け取り待ち");
  const word = $derived(data.kind === "ticket" ? "入場" : "受け取り");
  let loading = $state(false);
  const when = (ms: number | null) =>
    ms === null
      ? "—"
      : new Date(ms).toLocaleString("ja-JP", {
          dateStyle: "short",
          timeStyle: "short",
        });
  // この一覧の種類の明細だけを並べる(当日販売はまとめて売るので混ざることがある)
  const lines = (o: (typeof data.waiting)[number]) =>
    o.items
      .filter((i) => i.kind === data.kind)
      .map((i) => `${itemLabel(i)} ×${i.count}`)
      .join("、");
  async function refresh() {
    loading = true;
    await refreshAll();
    loading = false;
  }
</script>

<svelte:head>
  <title>{title} | スタッフ | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <a class="small" href="/staff">← スタッフ</a>
  <h1>{title}</h1>
  <nav class="cluster" aria-label="一覧の切り替え">
    <a
      class="button ghost mini"
      href="/staff/list?kind=goods"
      aria-current={data.kind === "goods" ? "page" : undefined}>受け取り待ち</a
    >
    <a
      class="button ghost mini"
      href="/staff/list?kind=ticket"
      aria-current={data.kind === "ticket" ? "page" : undefined}>入場前</a
    >
  </nav>
  <div class="grow"></div>
  <button
    type="button"
    class="outline mini"
    disabled={loading}
    onclick={refresh}>更新</button
  >
</div>

{#if data.waiting.length === 0}
  <p class="muted">{title}の注文はありません。</p>
{:else}
  <p>
    {data.waiting.length} 件。{#if data.cashDue > 0}うち当日払いの未払いは合計
      <strong>{yen(data.cashDue)}</strong>{/if}
  </p>
  <div class="scroll-x">
    <table>
      <thead>
        <tr>
          <th>お名前</th>
          <th>内容</th>
          <th>状態</th>
          <th class="r">金額</th>
          <th>番号</th>
        </tr>
      </thead>
      <tbody>
        {#each data.waiting as o (o.id)}
          <tr>
            <td
              >{o.name ?? "—"}
              <div class="tiny muted">{o.email ?? ""}</div></td
            >
            <td>{lines(o)}</td>
            <td
              ><span class="tag {STATUS[o.status].cls}"
                >{STATUS[o.status].label}</span
              ></td
            >
            <td class="r nw">{yen(o.amount)}</td>
            <td><a href="/staff/o/{o.code}">{o.code}</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<h2 class="h2">最近の{word}</h2>
{#if data.recent.length === 0}
  <p class="muted">まだありません。</p>
{:else}
  <div class="scroll-x">
    <table>
      <thead>
        <tr
          ><th>日時</th><th>お名前</th><th>内容</th><th>担当</th><th>番号</th
          ></tr
        >
      </thead>
      <tbody>
        {#each data.recent as o (o.id)}
          <tr>
            <td class="nw">{when(o.handedAt)}</td>
            <td>{o.name ?? (o.channel === "counter" ? "(会場で販売)" : "—")}</td
            >
            <td>{lines(o)}</td>
            <td>{o.handedBy ?? ""}</td>
            <td><a href="/staff/o/{o.code}">{o.code}</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
  .r {
    text-align: right;
  }
  .nw {
    white-space: nowrap;
  }
  .h2 {
    margin-top: 2.5rem;
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
  }
</style>
