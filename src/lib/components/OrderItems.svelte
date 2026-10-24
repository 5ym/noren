<script lang="ts">
  import "@anyblades/blades/layered/content/table";
  import { itemLabel, type OrderItem } from "#lib/order.js";
  import { yen } from "#lib/product.js";

  // 注文の明細と合計。注文ページ・スタッフの注文の画面・管理の注文で使う
  let {
    items,
    amount,
    big = false,
  }: { items: OrderItem[]; amount: number; big?: boolean } = $props();
</script>

<div class="scroll-x">
  <table class:big>
    <thead>
      <tr><th>商品</th><th class="r">数量</th><th class="r">小計</th></tr>
    </thead>
    <tbody>
      {#each items as item (item.id)}
        <tr>
          <td>{itemLabel(item)}</td>
          <td class="r nums">{item.count}</td>
          <td class="r nums">{yen(item.price * item.count)}</td>
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <th colspan="2">合計</th>
        <th class="r nums">{yen(amount)}</th>
      </tr>
    </tfoot>
  </table>
</div>

<style>
  table {
    width: 100%;
  }
  .r {
    text-align: right;
  }
  /* スタッフの画面。離れて見ても読めるように */
  .big {
    font-size: 1.1rem;
  }
</style>
