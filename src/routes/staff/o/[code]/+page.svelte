<script lang="ts">
  import { enhance, type SubmitFunction } from "$app/forms";

  import OrderItems from "#lib/components/OrderItems.svelte";
  import { handWord, methodLabel, needsHanding, STATUS } from "#lib/order.js";
  import { yen } from "#lib/product.js";
  import "@anyblades/blades/layered/content/code";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const order = $derived(data.order);
  const word = $derived(handWord(order));
  const st = $derived(STATUS[order.status]);
  const onSite = $derived(needsHanding(order));
  let busy = $state(false);
  const when = (ms: number) =>
    new Date(ms).toLocaleString("ja-JP", {
      dateStyle: "short",
      timeStyle: "short",
    });
  const submit: SubmitFunction = () => {
    busy = true;
    return async ({ update }) => {
      await update();
      busy = false;
    };
  };
</script>

<svelte:head>
  <title>注文 {order.code} | スタッフ | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <a class="small" href="/staff">← スタッフ</a>
  <h1>{onSite ? word : "注文"}</h1>
  <code>{order.code}</code>
</div>

{#if form?.error}
  <div role="alert" class="note err big"><span>{form.error}</span></div>
{:else if form?.done || data.sold}
  <div role="status" class="note ok big">
    <span
      >{data.sold && !form?.done
        ? "会計を記録しました。商品をお渡しください。"
        : `${word}を記録しました。`}</span
    >
  </div>
{:else if form?.undone}
  <div role="status" class="note warn big">
    <span>{word}を取り消しました。</span>
  </div>
{/if}

<div class="state cluster">
  <span class="tag lg {st.cls}">{st.label}</span>
  {#if onSite}
    {#if order.handedAt !== null}
      <span class="tag lg ok">{word}済み {when(order.handedAt)}</span>
    {:else}
      <span class="tag lg">まだ{word}していません</span>
    {/if}
  {/if}
</div>

{#if order.status === "unpaid" && order.handedAt === null}
  <section class="panel body due">
    <h2>当日払い・未払い</h2>
    <p>お客様から現金で代金を受け取ってください。</p>
    <p class="amount nums">{yen(order.amount)}</p>
  </section>
{/if}

<section class="stack">
  <OrderItems items={order.items} amount={order.amount} big />
  <dl class="info">
    <dt class="muted">お名前</dt>
    <dd>{order.name ?? "—"}</dd>
    <dt class="muted">メール</dt>
    <dd>{order.email ?? "—"}</dd>
    <dt class="muted">支払い</dt>
    <dd>{methodLabel(order.method)}</dd>
    <dt class="muted">注文</dt>
    <dd>
      {when(order.createdAt)}({order.channel === "counter"
        ? "会場で販売"
        : "オンライン"})
    </dd>
    {#if order.handedBy}
      <dt class="muted">担当</dt>
      <dd>{order.handedBy}</dd>
    {/if}
  </dl>
</section>

<div class="acts cluster">
  {#if onSite && order.handedAt === null}
    {#if order.status === "unpaid"}
      <form method="POST" action="?/collect" use:enhance={submit}>
        <button type="submit" class="buy big" disabled={busy}
          >代金を受けて{word}</button
        >
      </form>
    {:else if order.status === "paid"}
      <form method="POST" action="?/hand" use:enhance={submit}>
        <button type="submit" class="big" disabled={busy}>{word}を記録</button>
      </form>
    {:else}
      <p class="note err">
        <span>支払いが済んでいない注文です。渡さないでください。</span>
      </p>
    {/if}
  {/if}
  <a class="button outline big" href="/staff/scan">続けて読む</a>
  {#if onSite && order.handedAt !== null}
    <form method="POST" action="?/undo" use:enhance={submit}>
      <button type="submit" class="danger mini" disabled={busy}
        >{word}を取り消す</button
      >
    </form>
  {/if}
</div>

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
  .note.big {
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }
  .state {
    margin-bottom: 1rem;
  }
  .due {
    margin-bottom: 1rem;
    border-color: var(--nr-warning);
  }
  .due h2 {
    font-size: 1.1rem;
  }
  /* 現金で受け取る金額。離れていても読めるように大きく出す */
  .amount {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1.2;
  }
  .info {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 1rem;
    row-gap: 0.25rem;
    font-size: 0.9rem;
  }
  .acts {
    margin-block: 1.5rem 3rem;
  }
</style>
