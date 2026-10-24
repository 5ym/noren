<script lang="ts">
  import { imageUrl, KIND_LABELS, type ProductView } from "#lib/product.js";

  import Icon, { type IconName } from "./Icon.svelte";
  import Price from "./Price.svelte";

  let { product }: { product: ProductView } = $props();

  // 説明の 1 段落目だけをカードに出す。全文は商品ページ。
  const lead = $derived(
    product.descriptionText.split("\n").find((l) => l.trim()) ?? "",
  );
  const off = $derived(
    product.listPrice !== null && product.listPrice > product.price
      ? Math.round((1 - product.price / product.listPrice) * 100)
      : 0,
  );
  // 画像の無い商品の仮の絵。slug から色相を決めるので、同じ商品はいつも同じ色で、
  // 並べたときに灰色の箱が並ばない。
  const hue = $derived(
    [...product.slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7),
  );
  const icon: IconName = $derived(
    product.kind === "ticket"
      ? "ticket"
      : product.kind === "goods"
        ? "package"
        : product.windowsOnly
          ? "monitor"
          : "file",
  );
</script>

<a href="/items/{product.slug}" class="tile">
  <figure class="pic">
    {#if imageUrl(product)}
      <img src={imageUrl(product)} alt="" />
    {:else}
      <div
        class="blank"
        style="background: linear-gradient(135deg, hsl({hue} 60% 92%), hsl({(hue +
          40) %
          360} 55% 84%)); color: hsl({hue} 45% 38%)"
      >
        <Icon name={icon} size="4rem" />
      </div>
    {/if}
    <!-- 値引きと動作環境は画像の上に。一覧を流し見しても目に入る -->
    <div class="tl">
      {#if off}
        <span class="tag secondary">{off}%OFF</span>
      {/if}
    </div>
    <div class="tr">
      {#if product.kind !== "download"}
        <span class="tag solid">{KIND_LABELS[product.kind]}</span>
      {/if}
      {#if product.windowsOnly}
        <span class="tag info">Windows専用</span>
      {/if}
      {#if !product.available}
        <span class="tag warn">準備中</span>
      {/if}
    </div>
  </figure>
  <div class="txt">
    <h3>{product.name}</h3>
    {#if lead}
      <p class="clip">{lead}</p>
    {/if}
    <div class="foot">
      <Price {product} />
      <span class="more">
        詳しく見る <Icon name="arrow-right" size="1rem" />
      </span>
    </div>
  </div>
</a>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--nr-base-300);
    border-radius: var(--pico-border-radius);
    background: var(--nr-surface);
    box-shadow: var(--nr-shadow);
    color: inherit;
    text-decoration: none;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .tile:hover {
    transform: translateY(-0.25rem);
    box-shadow: var(--nr-shadow-lg);
  }
  .pic {
    position: relative;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: var(--nr-base-200);
  }
  .pic img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.3s;
  }
  .tile:hover .pic img {
    transform: scale(1.05);
  }
  .blank {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
  }
  .blank :global(svg) {
    opacity: 0.7;
  }
  .tl {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  .tr {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }
  .txt {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
  }
  .txt h3 {
    font-size: 1rem;
    line-height: 1.4;
  }
  /* 説明は 2 行で切る。カードの高さが揃う */
  .clip {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    color: var(--nr-muted);
    font-size: 0.875rem;
  }
  /* 値段と「詳しく見る」はカードの下端に揃える */
  .foot {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 0.5rem;
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--nr-primary);
    font-size: 0.875rem;
    font-weight: 700;
    opacity: 0.8;
  }
  .tile:hover .more {
    opacity: 1;
  }
</style>
