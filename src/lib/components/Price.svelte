<script lang="ts">
  import { type Product, yen } from "#lib/product.js";

  let { product, large = false }: { product: Product; large?: boolean } =
    $props();
  const discounted = $derived(
    product.listPrice !== null && product.listPrice > product.price,
  );
</script>

<!-- 通常価格は price より高いときだけ。同額や安い「通常価格」は嘘になる -->
<span class="price" class:large>
  {#if discounted}
    <span class="was">{yen(product.listPrice ?? 0)}</span>
  {/if}
  <span class="now">{yen(product.price)}</span>
  {#if product.price === 0}<span class="tax">無料</span>{:else}<span class="tax"
      >税込</span
    >{/if}
  {#if discounted && large}
    <span class="tag secondary"
      >{Math.round(
        (1 - product.price / (product.listPrice ?? 1)) * 100,
      )}%OFF</span
    >
  {/if}
</span>

<style>
  .price {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.5rem;
  }
  .was {
    color: var(--nr-muted);
    font-size: 0.875rem;
    text-decoration: line-through;
  }
  .now {
    color: var(--nr-primary);
    font-size: 1.25rem;
    font-weight: 700;
  }
  .tax {
    color: var(--nr-muted);
    font-size: 0.875rem;
  }
  /* large は商品ページ。一覧のカードより一段大きく出す */
  .price.large .was {
    font-size: 1.125rem;
  }
  .price.large .now {
    font-size: 2.25rem;
  }
</style>
