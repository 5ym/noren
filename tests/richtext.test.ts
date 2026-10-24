import { describe, expect, test } from "bun:test";

import {
  descriptionHtml,
  descriptionText,
  htmlToText,
  isHtml,
  sanitizeHtml,
  textToHtml,
} from "../src/lib/richtext";

describe("richtext", () => {
  test("平文は段落になる。空行で段落、1 つの改行は <br>", () => {
    expect(textToHtml("1 行目\n2 行目\n\n次の段落")).toBe(
      "<p>1 行目<br>2 行目</p><p>次の段落</p>",
    );
    expect(textToHtml("<b>&</b>")).toBe("<p>&lt;b&gt;&amp;&lt;/b&gt;</p>");
    expect(isHtml("<p>x</p>")).toBe(true);
    expect(isHtml("ただの文")).toBe(false);
  });

  test("Tiptap が出すタグは通り、それ以外は落ちる", () => {
    const html =
      "<h2>見出し</h2><p><strong>太字</strong> <em>斜体</em> <u>下線</u> <s>取消</s></p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>引用</p></blockquote><pre><code>x</code></pre><hr>";
    expect(sanitizeHtml(html)).toBe(html);
    expect(sanitizeHtml('<p onclick="x()" style="color:red">a</p>')).toBe(
      "<p>a</p>",
    );
    expect(sanitizeHtml("<div><span>a</span></div>")).toBe("a");
    expect(sanitizeHtml("<b>a</b><i>b</i>")).toBe(
      "<strong>a</strong><em>b</em>",
    );
  });

  test("script は中身ごと消える", () => {
    expect(sanitizeHtml('<p>a</p><script>alert("x")</script><p>b</p>')).toBe(
      "<p>a</p><p>b</p>",
    );
    expect(sanitizeHtml("<style>p{}</style><p>a</p>")).toBe("<p>a</p>");
    expect(sanitizeHtml("<!-- c --><p>a</p>")).toBe("<p>a</p>");
  });

  test("リンクは http(s) と mailto だけ。危ないものは文字だけ残る", () => {
    expect(
      sanitizeHtml('<a href="https://example.com" onclick="x">x</a>'),
    ).toBe(
      '<a href="https://example.com" rel="noopener" target="_blank">x</a>',
    );
    expect(sanitizeHtml('<a href="mailto:a@b.c">m</a>')).toBe(
      '<a href="mailto:a@b.c" rel="noopener" target="_blank">m</a>',
    );
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeHtml("<a>x</a>")).toBe("x");
  });

  test("空の段落は無いものとする", () => {
    expect(sanitizeHtml("<p></p>")).toBe("");
    expect(sanitizeHtml("<p></p><p>a</p><p></p>")).toBe("<p>a</p>");
  });

  test("タグ無しの文にできる", () => {
    expect(htmlToText("<h2>題</h2><p>a<br>b</p><ul><li>c</li></ul>")).toBe(
      "題\na\nb\nc",
    );
    expect(htmlToText("<p>&amp; &lt;x&gt;</p>")).toBe("& <x>");
  });

  test("description の 2 つの表し方が同じ入口で使える", () => {
    expect(descriptionHtml("平文\n2 行目")).toBe("<p>平文<br>2 行目</p>");
    expect(descriptionHtml("<p>html</p>")).toBe("<p>html</p>");
    expect(descriptionText("平文\n2 行目")).toBe("平文\n2 行目");
    expect(descriptionText("<h2>a</h2><p>b</p>")).toBe("a\nb");
  });
});
