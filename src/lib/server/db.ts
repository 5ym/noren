import type { Database as DatabaseType } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let instance: DatabaseType | undefined;

/** テーブルの形。起動のたびに流す(IF NOT EXISTS なので何度流しても同じ)。 */
const DDL = `
-- 売り物。ダウンロード商品のファイルと画像の実体は PRODUCTS_DIR/<slug>/ にある
CREATE TABLE IF NOT EXISTS product (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'download',
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  listPrice INTEGER,
  description TEXT NOT NULL DEFAULT '',
  windowsOnly INTEGER NOT NULL DEFAULT 0,
  payOnSite INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- 商品の種類(サイズ・色・大人/子ども など)。価格は商品単位
CREATE TABLE IF NOT EXISTS variant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productSlug TEXT NOT NULL REFERENCES product(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS variant_product ON variant(productSlug, sortOrder, id);

-- 注文 1 件が 1 行。sessionId の UNIQUE が Webhook の重複配信(Stripe は成功するまで
-- 何度でも送ってくる)を 1 回の納品に畳む。token は客に送るリンクの鍵、code は QR の番号
CREATE TABLE IF NOT EXISTS purchase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  sessionId TEXT UNIQUE,
  email TEXT,
  name TEXT,
  amount INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  paidAt INTEGER,
  expiresAt INTEGER,
  mailedAt INTEGER,
  handedAt INTEGER,
  handedBy TEXT
);
CREATE INDEX IF NOT EXISTS purchase_status ON purchase(status, createdAt);

-- 注文の明細。商品名・種類名は注文したときのものを写す(商品を消しても履歴は読める)
CREATE TABLE IF NOT EXISTS purchase_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchaseId INTEGER NOT NULL REFERENCES purchase(id) ON DELETE CASCADE,
  productSlug TEXT NOT NULL,
  productName TEXT NOT NULL,
  kind TEXT NOT NULL,
  variantId INTEGER,
  variantName TEXT,
  price INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purchase_item_purchase ON purchase_item(purchaseId);

-- 管理者・スタッフのログインの控え。DB に持つので「この端末だけ切る」ができる
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);

-- 店の情報(管理画面の「お店の設定」)。値は文字列か JSON
CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * 列を後から足すときは、SQLite の ALTER TABLE に IF NOT EXISTS が無いので、
 * PRAGMA table_info を見て無いときだけ ADD COLUMN する形をここに足す。
 */
export function ensureSchema(d: DatabaseType): void {
  d.exec(DDL);
}

export default function db(): DatabaseType {
  if (instance) return instance;
  const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
  const path = process.env.DB_PATH || "data/noren.db";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  instance = new Database(path);
  instance.exec("PRAGMA journal_mode = WAL;");
  // 入れ替えの数秒間、古いプロセスと新しいプロセスが同じファイルを開くことがある。
  // WAL で読むのは並べられ、書くのは 1 つずつ順番を待つ(SQLITE_BUSY で落とさない)
  instance.exec("PRAGMA busy_timeout = 5000;");
  instance.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(instance);
  return instance;
}
