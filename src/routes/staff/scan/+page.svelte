<script lang="ts">
  import { goto } from "$app/navigation";
  import type { Html5Qrcode } from "html5-qrcode";
  import { onDestroy, onMount } from "svelte";

  import { codeFromScan } from "#lib/order.js";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  // カメラで読む。端末に QR リーダーがあれば、それで読んでもスタッフ画面の注文が開く
  // (QR の中身は /staff/o/<番号> の URL)
  let scanner: Html5Qrcode | null = null;
  let cameraError = $state("");
  let scanError = $state("");
  let handled = false;

  onMount(async () => {
    const { Html5Qrcode } = await import("html5-qrcode");
    scanner = new Html5Qrcode("qr-reader", { verbose: false });
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScan,
        () => {},
      );
    } catch (e) {
      cameraError =
        e instanceof Error
          ? `カメラを起動できませんでした: ${e.message}`
          : "カメラを起動できませんでした";
    }
  });

  async function onScan(text: string) {
    if (handled) return;
    const code = codeFromScan(text);
    if (!code) {
      scanError = "この店の QR コードではないか、正しく読み取れませんでした。";
      return;
    }
    handled = true;
    await stop();
    goto(`/staff/o/${code}`);
  }

  async function stop() {
    if (scanner?.isScanning) {
      try {
        await scanner.stop();
      } catch {
        /* 止めるのに失敗しても、画面を離れれば止まる */
      }
    }
  }

  onDestroy(stop);
</script>

<svelte:head>
  <title>QR を読む | スタッフ | {data.shop.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bar">
  <a class="small" href="/staff">← スタッフ</a>
  <h1>QR を読む</h1>
</div>

<p class="small muted">
  受け取り用・入場用の QR コードをカメラに向けてください。
</p>
<div id="qr-reader"></div>
{#if cameraError}
  <div role="alert" class="note warn"><span>{cameraError}</span></div>
{/if}
{#if scanError}
  <div role="alert" class="note err"><span>{scanError}</span></div>
{/if}

<h2 class="h2">番号で開く</h2>
<form method="POST" class="cluster">
  <label class="field grow">
    <span class="lab">注文ページに出ている 12 文字の番号</span>
    <input
      name="code"
      required
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-invalid={form?.error ? "true" : undefined}
      aria-describedby={form?.error ? "code-error" : undefined}
    />
  </label>
  <button type="submit" class="self">開く</button>
</form>
{#if form?.error}
  <p id="code-error" class="note err"><span>{form.error}</span></p>
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
  /* html5-qrcode が中に video を差し込む枠。広い画面でもカメラ映像を大きくしすぎない */
  #qr-reader {
    max-width: 28rem;
    margin-block: 1rem;
  }
  .h2 {
    margin-top: 2rem;
    margin-bottom: 0.5rem;
    font-size: 1.125rem;
  }
  form {
    max-width: 28rem;
    align-items: flex-end;
  }
  .self {
    align-self: flex-end;
  }
</style>
