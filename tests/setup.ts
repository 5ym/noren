// bunfig.toml の preload。テストが import する前に、環境変数と一時ディレクトリを用意する。
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const TMP = join(import.meta.dir, ".tmp");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

process.env.DB_PATH = join(TMP, "noren.db");
process.env.PRODUCTS_DIR = join(TMP, "products");
// 署名の検証には API キーは要らないが、Stripe のインスタンスを作るのに何か要る
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_API_URL = "";
process.env.SMTP_HOST = "";
process.env.SHOP_MAIL_TO = "shop@example.test";
process.env.NOTIFY_WEBHOOK_URL = "";
process.env.SAMPLE_PRODUCTS = "";
