import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // SvelteKit の設定もここに置く (SvelteKit 3 から `svelte.config.*` は読まれない)。
    sveltekit({
      adapter: adapter(),
      paths: {
        // 公開 URL の origin (CSRF 判定に使う)。adapter-bun に実行時の `ORIGIN` は
        // 無いので、必要ならビルド時の `ORIGIN` で埋め込む。未設定なら
        // リクエストの Host (+ `PROTOCOL_HEADER`、既定 https) から求める。
        origin: process.env.ORIGIN || undefined,
      },
      version: {
        // The commit the image was built from, so every rollout publishes a
        // distinct version.json. Falls back to SvelteKit's build timestamp
        // when built outside CI.
        name: process.env.APP_VERSION || undefined,
        // Let already-open tabs notice a deploy on their own, rather than
        // only when a navigation has already failed.
        pollInterval: 60_000,
      },
    }),
  ],
  server: {
    host: true,
  },
  ssr: {
    external: ["bun:sqlite"],
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"],
  },
});
