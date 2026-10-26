<script lang="ts">
  import "@anyblades/blades/content/code";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import { untrack } from "svelte";

  // 商品説明のエディタ。Tiptap の StarterKit(v3 は Link と Underline も同梱)を、
  // 公開ページと同じ `prose` の見た目で編集できるようにしたもの。
  // 出力は HTML で、hidden input に入れて普通の form で送る(JS 無しの fallback は
  // 無いが、ここは管理画面なのでよい)。
  let {
    value = "",
    name = "description",
    label = "説明",
  }: { value?: string; name?: string; label?: string } = $props();

  let el: HTMLDivElement | undefined = $state();
  // Editor はクラスなので $state の proxy に包まない。ツールバーの活性表示は
  // tick を進めて描き直す。
  let editor = $state.raw<Editor | undefined>();
  let tick = $state(0);
  // 親から来る value は初期値としてだけ使う。以後はエディタが正になる
  let html = $state(untrack(() => value));

  $effect(() => {
    if (!el) return;
    const e = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            defaultProtocol: "https",
          },
        }),
      ],
      content: value,
      editorProps: {
        attributes: {
          // prose は app.css の共通クラス。幅と余白だけ下の :global で上書きする
          class: "prose paper",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label,
        },
      },
      onUpdate: ({ editor }) => {
        html = editor.getHTML();
      },
      onTransaction: () => {
        tick += 1;
      },
    });
    editor = e;
    return () => {
      e.destroy();
      editor = undefined;
    };
  });

  // 押されている状態のボタンに付ける印
  const active = (what: string, attrs?: Record<string, unknown>) => {
    void tick;
    return editor?.isActive(what, attrs) ? "on" : "";
  };

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "リンク先の URL(空にすると外します)",
      prev ?? "https://",
    );
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url.trim() || url.trim() === "https://") chain.unsetLink().run();
    else chain.setLink({ href: url.trim() }).run();
  }
</script>

<input type="hidden" {name} value={html} />

<div class="wrap">
  <div class="bar">
    <div class="set">
      <button
        type="button"
        class="ghost {active('bold')}"
        onclick={() => editor?.chain().focus().toggleBold().run()}
        title="太字">B</button
      >
      <button
        type="button"
        class="ghost it {active('italic')}"
        onclick={() => editor?.chain().focus().toggleItalic().run()}
        title="斜体">I</button
      >
      <button
        type="button"
        class="ghost un {active('underline')}"
        onclick={() => editor?.chain().focus().toggleUnderline().run()}
        title="下線">U</button
      >
      <button
        type="button"
        class="ghost st {active('strike')}"
        onclick={() => editor?.chain().focus().toggleStrike().run()}
        title="取り消し線">S</button
      >
    </div>
    <div class="set">
      <button
        type="button"
        class="ghost {active('heading', { level: 2 })}"
        onclick={() =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        title="見出し">見出し</button
      >
      <button
        type="button"
        class="ghost {active('heading', { level: 3 })}"
        onclick={() =>
          editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        title="小見出し">小見出し</button
      >
      <button
        type="button"
        class="ghost {active('paragraph')}"
        onclick={() => editor?.chain().focus().setParagraph().run()}
        title="本文">本文</button
      >
    </div>
    <div class="set">
      <button
        type="button"
        class="ghost {active('bulletList')}"
        onclick={() => editor?.chain().focus().toggleBulletList().run()}
        title="箇条書き">• 箇条書き</button
      >
      <button
        type="button"
        class="ghost {active('orderedList')}"
        onclick={() => editor?.chain().focus().toggleOrderedList().run()}
        title="番号付き">1. 番号</button
      >
      <button
        type="button"
        class="ghost {active('blockquote')}"
        onclick={() => editor?.chain().focus().toggleBlockquote().run()}
        title="引用">引用</button
      >
    </div>
    <div class="set">
      <button
        type="button"
        class="ghost {active('link')}"
        onclick={setLink}
        title="リンク">リンク</button
      >
      <button
        type="button"
        class="ghost"
        onclick={() => editor?.chain().focus().setHorizontalRule().run()}
        title="区切り線">―</button
      >
    </div>
    <div class="grow"></div>
    <div class="set">
      <button
        type="button"
        class="ghost"
        onclick={() => editor?.chain().focus().undo().run()}
        title="元に戻す">↶</button
      >
      <button
        type="button"
        class="ghost"
        onclick={() => editor?.chain().focus().redo().run()}
        title="やり直す">↷</button
      >
    </div>
  </div>
  <div bind:this={el}></div>
</div>

<style>
  .wrap {
    border: 1px solid var(--nr-base-300);
    border-radius: var(--nr-radius-box);
    background: var(--nr-surface);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    border-bottom: 1px solid var(--nr-base-300);
    padding: 0.5rem;
  }
  /* 同じ仲間のボタンは隙間を詰めて 1 かたまりに見せる */
  .set {
    display: inline-flex;
    gap: 0.125rem;
  }
  .bar button {
    min-height: 2rem;
    padding: 0.15rem 0.6rem;
    font-size: 0.8rem;
  }
  .it {
    font-style: italic;
  }
  .un {
    text-decoration: underline;
  }
  .st {
    text-decoration: line-through;
  }
  .on {
    background: var(--nr-base-300);
  }
  /* 本文の入力欄は Tiptap が作るので :global で。幅は絞らず枠いっぱい使う */
  .wrap :global(.paper) {
    max-width: none;
    min-height: 14rem;
    padding: 0.75rem 1rem;
  }
  .wrap :global(.paper:focus) {
    outline: none;
  }
</style>
