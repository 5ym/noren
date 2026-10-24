import { sanitizeHtml } from "../richtext";
import {
  DEFAULT_SHOP,
  type Shop,
  TOKUSHOHO_ROWS,
  type TokushohoKey,
} from "../shop";
import db from "./db";

/** 管理画面に返す、人が読む失敗。 */
export class SettingsError extends Error {}

const read = (key: string): string | undefined =>
  db()
    .query<{ value: string }, [string]>(
      "SELECT value FROM setting WHERE key = ?",
    )
    .get(key)?.value;

const write = (key: string, value: string) =>
  db().run(
    "INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );

/** 店の情報。まだ設定していない項目は見本の値(DEFAULT_SHOP)。毎回 DB から読む(安い) */
export function shop(): Shop {
  let links = DEFAULT_SHOP.links;
  const rawLinks = read("links");
  if (rawLinks !== undefined) {
    try {
      links = JSON.parse(rawLinks) as Shop["links"];
    } catch {
      links = [];
    }
  }
  const tokushoho = { ...DEFAULT_SHOP.tokushoho };
  for (const [key] of TOKUSHOHO_ROWS) {
    const v = read(`tokushoho.${key}`);
    if (v !== undefined) tokushoho[key] = v;
  }
  return {
    name: read("name") || DEFAULT_SHOP.name,
    tagline: read("tagline") ?? DEFAULT_SHOP.tagline,
    email: read("email") ?? DEFAULT_SHOP.email,
    owner: read("owner") ?? DEFAULT_SHOP.owner,
    links,
    aboutHtml: read("aboutHtml") ?? DEFAULT_SHOP.aboutHtml,
    tokushoho,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 1 行に「ラベル URL」。http(s) のものだけ */
export function parseLinks(text: string): Shop["links"] {
  const links: Shop["links"] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)\s+(\S+)$/.exec(line);
    if (!m || !/^https?:\/\/[^\s]+$/i.test(m[2])) {
      throw new SettingsError(
        `リンクは 1 行に「ラベル https://…」の形で書いてください: ${line}`,
      );
    }
    links.push({ label: m[1].trim(), href: m[2] });
  }
  if (links.length > 10) throw new SettingsError("リンクは 10 個までです");
  return links;
}

const str = (v: FormDataEntryValue | null, max: number, label: string) => {
  const s = String(v ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (s.length > max)
    throw new SettingsError(`${label}は ${max} 文字までにしてください`);
  return s;
};

export function saveShop(form: FormData): void {
  const name = str(form.get("name"), 60, "店の名前");
  if (!name) throw new SettingsError("店の名前を入れてください");
  const email = str(form.get("email"), 200, "問い合わせ先");
  if (email && !EMAIL.test(email))
    throw new SettingsError("問い合わせ先はメールアドレスで入れてください");
  const values: [string, string][] = [
    ["name", name],
    ["tagline", str(form.get("tagline"), 300, "一言")],
    ["email", email],
    ["owner", str(form.get("owner"), 60, "運営者")],
    ["links", JSON.stringify(parseLinks(String(form.get("links") ?? "")))],
    ["aboutHtml", sanitizeHtml(String(form.get("aboutHtml") ?? ""))],
  ];
  for (const [key, label] of TOKUSHOHO_ROWS) {
    values.push([
      `tokushoho.${key satisfies TokushohoKey}`,
      str(form.get(`tokushoho.${key}`), 1000, label),
    ]);
  }
  db().transaction(() => {
    for (const [k, v] of values) write(k, v);
  })();
}

/** 店の控えの宛先。SHOP_MAIL_TO が無ければ問い合わせ先 */
export const shopMailTo = () => process.env.SHOP_MAIL_TO || shop().email;
