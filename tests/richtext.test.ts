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

  test("消した跡からタグが組み上がらない", () => {
    expect(sanitizeHtml("<scr<script>ipt>alert(1)</script>")).toBe(
      "ipt&gt;alert(1)",
    );
    expect(sanitizeHtml("<<script>script>alert(1)<</script>/script>")).toBe(
      "&lt;/script&gt;",
    );
    expect(sanitizeHtml("<!--<!-- x -->--><p>a</p>")).toBe("--&gt;<p>a</p>");
    // 閉じていないコメントやタグは、ブラウザと同じく残りを捨てる
    expect(sanitizeHtml("<p>a</p><!-- <script>alert(1)</script>")).toBe(
      "<p>a</p>",
    );
    expect(sanitizeHtml('<p>a</p><a href="https://e.com/ x')).toBe("<p>a</p>");
    expect(sanitizeHtml("<p>a</p><script>alert(1)")).toBe("<p>a</p>");
    expect(sanitizeHtml("<SCRIPT >alert(1)</SCRIPT ><p>a</p>")).toBe(
      "<p>a</p>",
    );
  });

  test("文の中の < > & はエスケープし、実体参照は 1 回だけ戻す", () => {
    expect(sanitizeHtml("<p>1 < 2 & 3 > 0</p>")).toBe(
      "<p>1 &lt; 2 &amp; 3 &gt; 0</p>",
    );
    expect(sanitizeHtml("<p>&lt;script&gt;</p>")).toBe("<p>&lt;script&gt;</p>");
    // &amp;lt; は「&lt;」という文字。< にはならない
    expect(sanitizeHtml("<p>&amp;lt;script&amp;gt;</p>")).toBe(
      "<p>&amp;lt;script&amp;gt;</p>",
    );
    expect(htmlToText("<p>&amp;lt;script&amp;gt;</p>")).toBe("&lt;script&gt;");
    expect(htmlToText("<p>&#60;b&#x3e; &quot;q&quot; &#39;s&#39;</p>")).toBe(
      "<b> \"q\" 's'",
    );
  });

  test("href の引用符で属性を抜け出せない", () => {
    expect(
      sanitizeHtml(`<a href='https://e.com/"onmouseover="alert(1)'>x</a>`),
    ).toBe(
      '<a href="https://e.com/&quot;onmouseover=&quot;alert(1)" rel="noopener" target="_blank">x</a>',
    );
    expect(sanitizeHtml('<a href="https://e.com/"><b>x</b></a>')).toBe(
      '<a href="https://e.com/" rel="noopener" target="_blank"><strong>x</strong></a>',
    );
    expect(sanitizeHtml("<a href=https://e.com/'x>y</a>")).toBe(
      '<a href="https://e.com/&#39;x" rel="noopener" target="_blank">y</a>',
    );
    // 属性値の &amp; は & として読み、出すときに 1 回だけエスケープする
    expect(sanitizeHtml('<a href="https://e.com/?a=1&amp;b=2">x</a>')).toBe(
      '<a href="https://e.com/?a=1&amp;b=2" rel="noopener" target="_blank">x</a>',
    );
  });

  test("実体参照で書いた javascript: も通らない", () => {
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).toBe("x");
    expect(
      sanitizeHtml('<a href="javascript:x" href="https://e.com/">x</a>'),
    ).toBe("x");
  });

  test("何度通しても同じ", () => {
    for (const html of [
      "<p>&amp;lt; &lt; &gt; &quot; ' \"</p>",
      `<a href='https://e.com/?q="&amp;'>x</a>`,
      "<scr<script>ipt>alert(1)</script>",
      "<p></p><p>a&nbsp;b</p><p></p>",
    ]) {
      const once = sanitizeHtml(html);
      expect(sanitizeHtml(once)).toBe(once);
    }
  });

  test("空の段落の繰り返しが長くても時間がかからない", () => {
    const html = `<p></p>${" <p></p>".repeat(50_000)}x`;
    const started = performance.now();
    expect(sanitizeHtml(html)).toBe("x");
    expect(performance.now() - started).toBeLessThan(1000);
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
