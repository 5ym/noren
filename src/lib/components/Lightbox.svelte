<script lang="ts">
  import "@anyblades/blades/layered/components/card";
  import "@anyblades/blades/layered/components/modal";
  import Icon from "./Icon.svelte";

  /**
   * 画像の拡大表示。`index` が数字なら開き、null なら閉じる(親と双方向)。
   * <dialog> なので Esc・背景クリックは自前で持たず、← → だけ足している。
   */
  let {
    images,
    alt,
    index = $bindable(null),
  }: { images: string[]; alt: string; index?: number | null } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (index === null) {
      if (dialog.open) dialog.close();
    } else if (!dialog.open) dialog.showModal();
  });

  const step = (d: number) => {
    if (index === null || images.length < 2) return;
    index = (index + d + images.length) % images.length;
  };
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  onclose={() => {
    index = null;
  }}
  onkeydown={(e) => {
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  }}
  aria-label="{alt} の拡大画像"
>
  {#if index !== null}
    <div class="box">
      <img src={images[index]} {alt} />
      {#if images.length > 1}
        <span class="tag solid">{index + 1} / {images.length}</span>
        <button
          type="button"
          class="round prev"
          onclick={() => step(-1)}
          aria-label="前の画像"><Icon name="chevron-left" /></button
        >
        <button
          type="button"
          class="round next"
          onclick={() => step(1)}
          aria-label="次の画像"><Icon name="chevron-right" /></button
        >
      {/if}
    </div>
    <!-- 背面全体が閉じるボタン。文字は見せない -->
    <form method="dialog" class="back">
      <button type="submit">閉じる</button>
    </form>
    <form method="dialog" class="shut">
      <button type="submit" class="round" aria-label="閉じる"
        ><Icon name="x" /></button
      >
    </form>
  {/if}
</dialog>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0;
    border: 0;
    padding: 0;
    overflow: hidden;
    background: transparent;
  }
  .sheet[open] {
    display: flex;
  }
  /* 暗くするのは下の .back。ブラウザ既定の backdrop は消す */
  .sheet::backdrop {
    background: transparent;
  }
  .box {
    position: relative;
    z-index: 1;
    display: flex;
    max-height: 92vh;
    width: auto;
    max-width: min(96vw, 80rem);
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .box img {
    height: 82vh;
    max-width: 92vw;
    border-radius: var(--nr-radius-box);
    background: var(--nr-surface);
    object-fit: contain;
  }
  .back {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: color-mix(in srgb, var(--pico-color) 80%, transparent);
    backdrop-filter: blur(4px);
  }
  .back button {
    width: 100%;
    height: 100%;
    border: 0;
    background: none;
    color: transparent;
    cursor: default;
  }
  .round {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    min-height: 0;
    border: 1px solid var(--nr-base-300);
    border-radius: 999px;
    background: var(--nr-surface);
    padding: 0;
    color: var(--pico-color);
  }
  .prev {
    position: absolute;
    top: 50%;
    left: 0.5rem;
    transform: translateY(-50%);
  }
  .next {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
  }
  .shut {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 2;
  }
</style>
