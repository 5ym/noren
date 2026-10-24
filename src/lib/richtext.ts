/**
 * 商品説明のリッチテキスト。管理画面の Tiptap が HTML を出し、DB にはその HTML を
 * そのまま持つ。表示するときは必ず sanitizeHtml を通す(書くのは admin ロールだけだが、
 * DB に何が入っていても画面に script が出ない状態を保つ)。
 *
 * 依存を足さないために自前。許可するタグと属性を列挙して、それ以外は捨てる。
 * Tiptap の StarterKit が出すものだけ通せばよく、汎用の HTML sanitizer は要らない。
 */

const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "code",
  "pre",
  "hr",
]);

/** 古い書き方を寄せる。 */
const ALIAS: Record<string, string> = { b: "strong", i: "em", strike: "s" };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 見た目が HTML か(タグで始まる)。平文の説明との切り分けに使う。 */
export const isHtml = (s: string) => /^\s*<[a-z]/i.test(s);

/** 平文の説明を段落に。空行で段落、1 つの改行は <br>。 */
export function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim());
  return paragraphs
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * 許可したタグ・属性だけ残す。許可しないタグは中身の文字だけ残す
 * (script / style は中身ごと捨てる)。
 */
export function sanitizeHtml(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");

  s = s.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (_m, rawName: string, rawAttrs: string) => {
      const closing = _m.startsWith("</");
      const name = ALIAS[rawName.toLowerCase()] ?? rawName.toLowerCase();
      if (!ALLOWED.has(name)) return "";
      if (closing) return name === "br" || name === "hr" ? "" : `</${name}>`;
      if (name === "br" || name === "hr") return `<${name}>`;
      if (name === "a") {
        const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(
          rawAttrs,
        );
        const url = (href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
        // 危ないリンクは、リンクであることをやめて文字だけ残す
        if (!SAFE_HREF.test(url)) return "";
        return `<a href="${escapeHtml(url)}" rel="noopener" target="_blank">`;
      }
      return `<${name}>`;
    },
  );

  // href を落とした <a> の閉じタグが余る。対応する開きタグが無いものは消す
  s = s.replace(/<\/a>/g, (m, offset: number) => {
    const before = s.slice(0, offset);
    const opens = (before.match(/<a\b/g) ?? []).length;
    const closes = (before.match(/<\/a>/g) ?? []).length;
    return opens > closes ? m : "";
  });

  // Tiptap は空のときも <p></p> を出す。前後の空段落は無いものとする
  return s.replace(/^(\s*<p>\s*<\/p>\s*)+|(\s*<p>\s*<\/p>\s*)+$/g, "").trim();
}

/** 表示用。HTML ならそのまま(sanitize 済み)、平文なら段落に変換して返す。 */
export const descriptionHtml = (description: string) =>
  isHtml(description) ? sanitizeHtml(description) : textToHtml(description);

/** meta description やカードの 1 行目など、タグ無しで欲しいとき。 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|blockquote|pre|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l)
    .join("\n");
}

export const descriptionText = (description: string) =>
  isHtml(description) ? htmlToText(sanitizeHtml(description)) : description;
