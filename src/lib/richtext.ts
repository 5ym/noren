/**
 * 商品説明のリッチテキスト。管理画面の Tiptap が HTML を出し、DB にはその HTML を
 * そのまま持つ。表示するときは必ず sanitizeHtml を通す(書くのは admin ロールだけだが、
 * DB に何が入っていても画面に script が出ない状態を保つ)。
 *
 * 依存を足さないために自前。許可するタグと属性を列挙して、それ以外は捨てる。
 * Tiptap の StarterKit が出すものだけ通せばよく、汎用の HTML sanitizer は要らない。
 *
 * 正規表現の置換を重ねると、消した跡から新しいタグができたり
 * (`<scr<script>ipt>`)、エスケープを 2 回戻したりする。なので入力は
 * 先頭から 1 回だけ読んでタグと文字に分け(tokenize)、それを組み立て直す。
 * 文字は実体参照を 1 回だけ戻してから、出すときに 1 回だけエスケープする。
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

/** 閉じタグを持たないもの。 */
const VOID = new Set(["br", "hr"]);

/** 中身ごと捨てるもの。 */
const RAW_TEXT = new Set(["script", "style"]);

/** htmlToText で、閉じたところを改行にするもの。 */
const BLOCK = new Set([
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "div",
]);

/** 古い書き方を寄せる。 */
const ALIAS: Record<string, string> = { b: "strong", i: "em", strike: "s" };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 文字にも属性値(引用符の中)にもそのまま置ける形にする。 */
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * 実体参照を戻す。1 回の置換でやるので `&amp;lt;` は `&lt;` という文字になり、
 * `<` までは戻らない。知らない名前はそのまま残す。
 */
function decodeEntities(s: string): string {
  return s.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
    (m, dec?: string, hex?: string, name?: string) => {
      if (name !== undefined) return NAMED[name] ?? m;
      const code = dec !== undefined ? Number(dec) : parseInt(hex ?? "", 16);
      const valid =
        code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : "�";
    },
  );
}

/** タグ。名前は小文字、属性値は実体参照を戻してある。 */
type Tag = {
  type: "tag";
  name: string;
  closing: boolean;
  attrs: Map<string, string>;
};

/** 文字。実体参照は戻してある。 */
type Text = { type: "text"; text: string };

type Token = Tag | Text;

const TAG_NAME = /[a-zA-Z][a-zA-Z0-9]*/y;
const ATTR_NAME = /[^\s/>][^\s/>=]*/y;
const UNQUOTED = /[^\s>]*/y;
const SPACE = /\s/;

/**
 * `<` の位置からタグを 1 つ読む。タグ名が続かなければ null(その `<` は文字)。
 * `>` に届かないまま終わったら "eof"(ブラウザと同じく、残りは捨てる)。
 */
function readTag(
  html: string,
  start: number,
): { tag: Tag; end: number } | null | "eof" {
  let j = start + 1;
  const closing = html[j] === "/";
  if (closing) j++;
  TAG_NAME.lastIndex = j;
  const m = TAG_NAME.exec(html);
  if (!m) return null;
  const name = m[0].toLowerCase();
  j += m[0].length;
  const attrs = new Map<string, string>();
  while (j < html.length) {
    const c = html[j];
    if (c === ">") {
      return { tag: { type: "tag", name, closing, attrs }, end: j + 1 };
    }
    if (c === "/" || SPACE.test(c)) {
      j++;
      continue;
    }
    ATTR_NAME.lastIndex = j;
    const key = (ATTR_NAME.exec(html) as RegExpExecArray)[0];
    j += key.length;
    while (j < html.length && SPACE.test(html[j])) j++;
    let value = "";
    if (html[j] === "=") {
      j++;
      while (j < html.length && SPACE.test(html[j])) j++;
      const q = html[j];
      if (q === '"' || q === "'") {
        const end = html.indexOf(q, j + 1);
        if (end < 0) return "eof";
        value = html.slice(j + 1, end);
        j = end + 1;
      } else {
        UNQUOTED.lastIndex = j;
        value = (UNQUOTED.exec(html) as RegExpExecArray)[0];
        j += value.length;
      }
    }
    const k = key.toLowerCase();
    // 同じ属性が 2 回あれば、ブラウザと同じく最初のものを使う
    if (!attrs.has(k)) attrs.set(k, decodeEntities(value));
  }
  return "eof";
}

/**
 * HTML を先頭から 1 回だけ読んで、タグと文字に分ける。
 * コメントと script / style の中身は捨てる。
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let text = "";
  const flush = () => {
    if (text) tokens.push({ type: "text", text: decodeEntities(text) });
    text = "";
  };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    const read = readTag(html, i);
    if (read === "eof") break;
    if (read === null) {
      text += "<";
      i++;
      continue;
    }
    flush();
    i = read.end;
    const { tag } = read;
    if (!tag.closing && RAW_TEXT.has(tag.name)) {
      // 対応する閉じタグまで読み飛ばす。無ければ残りを全部捨てる
      const close = new RegExp(`</${tag.name}[\\s/>]`, "gi");
      close.lastIndex = i;
      const found = close.exec(html);
      if (!found) break;
      const end = html.indexOf(">", found.index);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    tokens.push(tag);
  }
  flush();
  return tokens;
}

const isBlank = (s: string) => s.trim() === "";

/** Tiptap は空のときも <p></p> を出す。前後の空段落(と空白)を落とす。 */
function trimEmptyParagraphs(parts: string[]): string[] {
  let start = 0;
  let end = parts.length - 1;
  for (;;) {
    while (start <= end && isBlank(parts[start])) start++;
    if (parts[start] !== "<p>") break;
    let n = start + 1;
    while (n <= end && isBlank(parts[n])) n++;
    if (n > end || parts[n] !== "</p>") break;
    start = n + 1;
  }
  for (;;) {
    while (end >= start && isBlank(parts[end])) end--;
    if (end < start || parts[end] !== "</p>") break;
    let n = end - 1;
    while (n >= start && isBlank(parts[n])) n--;
    if (n < start || parts[n] !== "<p>") break;
    end = n - 1;
  }
  return parts.slice(start, end + 1);
}

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
 * (script / style は中身ごと捨てる)。何度通しても同じ結果になる。
 */
export function sanitizeHtml(html: string): string {
  const parts: string[] = [];
  let openLinks = 0;
  for (const token of tokenize(html)) {
    if (token.type === "text") {
      parts.push(escapeHtml(token.text));
      continue;
    }
    const name = ALIAS[token.name] ?? token.name;
    if (!ALLOWED.has(name)) continue;
    if (VOID.has(name)) {
      if (!token.closing) parts.push(`<${name}>`);
      continue;
    }
    if (name === "a") {
      if (token.closing) {
        // href を落とした <a> の閉じタグは余るので、開いているぶんだけ閉じる
        if (openLinks > 0) {
          openLinks--;
          parts.push("</a>");
        }
        continue;
      }
      const url = (token.attrs.get("href") ?? "").trim();
      // 危ないリンクは、リンクであることをやめて文字だけ残す
      if (!SAFE_HREF.test(url)) continue;
      openLinks++;
      parts.push(
        `<a href="${escapeHtml(url)}" rel="noopener" target="_blank">`,
      );
      continue;
    }
    parts.push(token.closing ? `</${name}>` : `<${name}>`);
  }
  return trimEmptyParagraphs(parts).join("").trim();
}

/** 表示用。HTML ならそのまま(sanitize 済み)、平文なら段落に変換して返す。 */
export const descriptionHtml = (description: string) =>
  isHtml(description) ? sanitizeHtml(description) : textToHtml(description);

/** meta description やカードの 1 行目など、タグ無しで欲しいとき。 */
export function htmlToText(html: string): string {
  let text = "";
  for (const token of tokenize(html)) {
    if (token.type === "text") text += token.text;
    else if (VOID.has(token.name) && !token.closing) text += "\n";
    else if (BLOCK.has(token.name) && token.closing) text += "\n";
  }
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l)
    .join("\n");
}

export const descriptionText = (description: string) =>
  isHtml(description) ? htmlToText(sanitizeHtml(description)) : description;
