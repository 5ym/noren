<script lang="ts">
  import {
    handWord,
    itemLabel,
    methodLabel,
    needsHanding,
    STATUS,
  } from "#lib/order.js";
  import { yen } from "#lib/product.js";
  import "@anyblades/blades/content/table";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const when = (ms: number | null) =>
    ms === null
      ? "—"
      : new Date(ms).toLocaleString("ja-JP", {
          dateStyle: "short",
          timeStyle: "short",
        });
  const pending = $derived(
    data.orders.filter((o) => o.status === "pending" && o.channel === "online"),
  );
</script>

<svelte:head>
  <title>注文 | 管理 | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <a class="small" href="/admin">← 商品</a>
  <h1>注文</h1>
  {#if pending.length}
    <span class="tag warn">入金待ち {pending.length}</span>
  {/if}
</div>

<!-- 入金待ちは Stripe が期限を管理している。コンビニは払込期限が来ると
     async_payment_failed、決済画面のまま放置は 24 時間で expired が飛んできて、
     ここの状態が変わる。こちらから取り消す操作は要らない(Stripe 側で完結する)。 -->
<p class="intro">
  入金待ちの注文は、コンビニは払込期限、銀行振込は決済画面の失効(24 時間)で
  Stripe 側が自動的に終わらせます。
  終わると「未入金で終了」または「失効」に変わり、購入者へのメールは送られません。こちらで取り消す操作はありません。
  「当日払い・未払い」は会場で現金を受けると支払い済みになります。
</p>

<div class="scroll-x">
  <table>
    <thead>
      <tr>
        <th>状態</th>
        <th>内容</th>
        <th>購入者</th>
        <th class="r">金額</th>
        <th>支払い</th>
        <th>注文</th>
        <th>期限</th>
        <th>メール</th>
        <th>受け渡し</th>
      </tr>
    </thead>
    <tbody>
      {#each data.orders as o (o.id)}
        {@const st = STATUS[o.status] ?? { label: o.status, cls: "" }}
        <tr class={o.status === "pending" ? "wait" : ""}>
          <td><span class="tag {st.cls}">{st.label}</span></td>
          <td>
            {#each o.items as i (i.id)}
              <div>
                <a href="/admin/{i.productSlug}">{itemLabel(i)}</a> × {i.count}
              </div>
            {/each}
            <div class="tiny muted">
              {o.channel === "counter" ? "会場で販売" : "オンライン"} ·
              <a href="/staff/o/{o.code}">{o.code}</a>
            </div>
          </td>
          <td>
            {#if o.email}
              <a href="mailto:{o.email}">{o.email}</a>
            {:else}
              —
            {/if}
            {#if o.name}<div class="tiny muted">{o.name}</div>{/if}
          </td>
          <td class="r nw">{yen(o.amount)}</td>
          <td class="nw">{methodLabel(o.method)}</td>
          <td class="nw">{when(o.createdAt)}</td>
          <td
            class="nw"
            class:over={o.status === "pending" &&
              o.expiresAt !== null &&
              o.expiresAt < Date.now()}
          >
            {o.status === "pending" ? when(o.expiresAt) : "—"}
          </td>
          <td class="nw">{when(o.mailedAt)}</td>
          <td class="nw">
            {#if !needsHanding(o)}
              —
            {:else if o.handedAt !== null}
              {handWord(o)}
              {when(o.handedAt)}
              {#if o.handedBy}<div class="tiny muted">{o.handedBy}</div>{/if}
            {:else}
              <span class="muted">まだ</span>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="9" class="muted">注文はまだありません</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<p class="after">
  「支払い」は決済手段の種別。「期限」はコンビニの払込期限(銀行振込は Stripe
  側に期限が無いため空)。 Session ID など詳しくは Stripe のダッシュボードで。
</p>

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
  .intro {
    max-width: var(--nr-page-width);
    margin-bottom: 1rem;
    color: var(--nr-muted);
    font-size: 0.875rem;
  }
  .r {
    text-align: right;
  }
  .nw {
    white-space: nowrap;
  }
  /* 入金待ちの行は薄く色を敷いて、目で拾えるようにする */
  tr.wait {
    background: color-mix(in oklch, var(--nr-warning) 12%, transparent);
  }
  /* 払込期限を過ぎたまま残っている行 */
  .over {
    color: var(--nr-error-text);
  }
  .after {
    margin-top: 1rem;
    color: var(--nr-muted);
    font-size: 0.78rem;
  }
</style>
