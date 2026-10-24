import { defineConfig, devices } from "@playwright/test";

/**
 * e2e。ビルドしたアプリを、偽の IdP・Stripe・SMTP・通知先と一緒に e2e/serve.ts で起動して
 * ブラウザから触る。DB とファイルは e2e/.tmp に毎回作り直す。
 *
 * ワーカーは 1 つ: 商品テーブルもメールの箱も 1 つを共有しているので、並列にすると
 * テスト同士が見合ってしまう。
 */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "ja-JP",
    trace: "retain-on-failure",
    // 本番の前段の代わり。アプリは PROTOCOL_HEADER でこれを見て自分の origin を
    // http://127.0.0.1:4173 だと知る(e2e/serve.ts)。page も request も載る
    extraHTTPHeaders: { "x-forwarded-proto": "http" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run build && bun e2e/serve.ts",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
