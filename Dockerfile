FROM oven/bun:1.4.4-slim AS builder
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun i --frozen-lockfile
COPY . .
# 公開 URL の origin (例: https://shop.example.com)。SvelteKit の `paths.origin` として
# ビルド時に埋め込む (adapter-bun に実行時の ORIGIN は無い)。空なら
# リクエストの Host と PROTOCOL_HEADER から求める (vite.config.ts)。
ARG ORIGIN=
# Declared after the source copy so it can't invalidate the dependency layers.
# Stamps the build into version.json, which open tabs poll to spot a rollout.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN ORIGIN=$ORIGIN bun run build
# 配信用のイメージにはシェルが無いので、DB とファイルの置き場もここで作っておく
RUN mkdir -p /out/data /out/files

# 実行時の依存は無い: package.json の dependencies を空にしてあるので、stripe や Tiptap も含めて
# 全部 Rolldown が build/ に束ねる(SvelteKit は dependencies だけを外部化する)。
# node_modules をイメージに載せないぶん軽い。
#
# 配信用はシェルもパッケージマネージャも無い distroless の Bun。uid 1000:1000 で動かす
# (distroless には bun という名前のユーザーが無いので数字で書く)。
# ボリュームの DB とファイルは 1000 のものになる。
FROM oven/bun:1.4.4-distroless
WORKDIR /usr/src/app
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/usr/src/app/data/noren.db
ENV PRODUCTS_DIR=/usr/src/app/files
# 管理画面から数百 MB のファイルを PUT で流し込むので、adapter-bun の既定(512KB)を上げる
ENV BODY_SIZE_LIMIT=4G
# 何も流れない接続を切るまでの秒数(adapter-bun、Bun.serve の idleTimeout)。既定の 10 秒だと
# 大きなファイルを受け終えてからディスクに書き切るまでの間や、Webhook でメールを送る間に切れうる
ENV CONNECTION_IDLE_TIMEOUT=255
COPY --from=builder --chown=1000:1000 /out/ ./
USER 1000:1000
COPY --from=builder --chown=1000:1000 /usr/src/app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /usr/src/app/build ./build
VOLUME ["/usr/src/app/data", "/usr/src/app/files"]
# ENTRYPOINT が bun なので、CMD に bun を重ねない (`bun bun ./build` は `bun build` になってバンドルし始める)
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["./build"]
