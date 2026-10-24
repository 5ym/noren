<script lang="ts">
  import "@anyblades/blades/layered/content/table";
  import { TOKUSHOHO_ROWS } from "#lib/shop.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const shop = $derived(data.shop);
</script>

<svelte:head>
  <title>特定商取引法に基づく表記 | {shop.name}</title>
</svelte:head>

<div class="prose doc">
  <h1>特定商取引法に基づく表記</h1>
  <!--
		個人の販売者は、請求があったときに遅滞なく開示する旨を書けば所在地・電話番号を
		省略できる(特定商取引法ガイド「通信販売の広告」の表示事項の省略)。見本の文はその形。
		中身は管理画面の「お店の設定」で書く。空の行は出さない。
	-->
  <!-- 見出し列は内容幅に任せると「運営責任 / 者」のように途中で割れる。
	     日本語は単語の切れ目が無いので、幅を固定して折り返さない。 -->
  <table>
    <tbody>
      {#each TOKUSHOHO_ROWS as [key, label] (key)}
        {#if shop.tokushoho[key]}
          <tr>
            <th>{label}</th>
            <td>{shop.tokushoho[key]}</td>
          </tr>
        {/if}
        {#if key === "phone" && shop.email}
          <tr>
            <th>連絡先</th>
            <td><a href="mailto:{shop.email}">{shop.email}</a></td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>

  <h2>個人情報の取り扱い</h2>
  <p>
    ご注文のときにいただいたメールアドレスとお名前は、商品のお届け・会場での受け渡し・注文の控えのためだけに使い、第三者には渡しません。
    カード情報は Stripe が扱い、当サイトには保存されません。
  </p>
</div>

<style>
  /* 読む幅(.prose)を真ん中に置くだけ */
  .doc {
    margin-inline: auto;
    margin-block: 2rem;
  }
  .doc table {
    width: 100%;
  }
  /* 見出し列は内容幅に任せると途中で割れるので、幅を固定して折り返さない(上のコメント) */
  .doc th {
    width: 9rem;
    vertical-align: top;
    text-align: left;
  }
  td {
    white-space: pre-line;
  }
  @media (width >= 40rem) {
    .doc th {
      width: 13rem;
      white-space: nowrap;
    }
  }
</style>
