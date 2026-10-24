# noren / 暖簾

暖簾。商品を並べて売り、ダウンロード商品はメールで届け、グッズとチケットは会場で QR を見せて受け取ってもらう、小さな店と催しのためのアプリ。

QR の入場受付と物販(事前購入・当日販売・受け取り)を回していた **mogiri** と、
Stripe Checkout で払うとファイルがメールで届くダウンロード販売の **noren** を 1 つにしたもの。
土台は noren(商品の管理画面・Checkout・メール)で、mogiri の入場受付・受け取り・当日販売をその上に載せた。

- 客はアカウントを作らない。Stripe Checkout で払う(メールアドレスは Stripe が聞く)と、
  **注文ページのリンク**(`/orders/<token>`)がメールで届く。ページには受け取り・入場用の QR と、ダウンロードのリンクが出る
- 管理者とスタッフは OIDC でログインする。パスワードは持たない
- 実行時の依存は無い(`dependencies` は空)。Bun と `build/` だけで動く

## 技術スタック

| 領域           | 使用技術                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| ランタイム     | [Bun](https://bun.sh) 1.4.4                                                               |
| フレームワーク | [SvelteKit 3](https://svelte.dev/docs/kit)(Svelte 5 / runes)+ adapter-bun                 |
| データベース   | SQLite(`bun:sqlite`、素の SQL の薄い層)                                                   |
| UI             | [Blades](https://blades.ninja/) の Pico(素の CSS、使う部品だけ読む)。明暗は OS に合わせる |
| 商品説明       | [Tiptap](https://tiptap.dev/)(保存時にサーバで許可したタグだけに落とす)                   |
| 決済           | Stripe Checkout(オンライン)、現金・Square POS(会場)                                       |
| メール         | SMTP(自前のクライアント `src/lib/server/smtp.ts`)                                         |
| ログイン       | OIDC(認可コード + PKCE、自前のクライアント `src/lib/server/oidc.ts`)                      |
| QR             | 生成はサーバで SVG(`qrcode`)、読み取りは `html5-qrcode`                                   |
| Lint/Format    | [oxlint](https://oxc.rs/docs/guide/usage/linter) + `bun fmt`                              |

## 商品の種類

商品は 1 つの一覧と 1 つの管理画面で扱い、作るときに種類を選ぶ(あとから変えられない)。

| 種類             | 届け方                                                                                          | 種類だけの項目                                 |
| ---------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| ダウンロード商品 | 払うとファイルを添付したメール(合計 20MB まで)と、30 日有効なリンク `/dl/<token>/<slug>/<file>` | 送るファイル、Windows 専用の札                 |
| 会場で受け取り   | 注文ページの QR を会場でスタッフが読み、受け渡しを記録する                                      | 種類(サイズ・色など)、当日払いの予約を受けるか |
| 入場チケット     | 注文ページの QR を受付でスタッフが読み、入場を記録する                                          | 種類(一般・学生など)、当日払いの予約を受けるか |

- 共通: 名前・価格・通常価格(高いときだけ取り消し線と %OFF)・説明(Tiptap)・画像(12 枚まで、1 枚目が代表、並べ替え)・公開/非公開・並び順
- 種類(variant)がある商品は、種類ごとに数量を選ぶ。価格は商品で 1 つ(値段の違うものは別の商品にする)
- 価格が 0 の商品は Checkout を通さず、メールアドレスとお名前で「申し込む」
- 「当日払いの予約を受ける」を付けた物販・チケットは、Checkout の代わりに「当日払いで予約する」も選べる。
  会場で現金を受けたときに支払い済みになる
- カートは無い。客は 1 回に 1 つの商品を(種類ごとの数量で)買う。会場の当日販売はまとめて売れる
- 最初の起動で商品が 1 つも無ければ、種類ごとの見本を 1 つずつ入れる(`SAMPLE_PRODUCTS=false` で入れない)

## 画面

| 道                                       | 誰が     | 何を                                                                     |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `/`、`/items/<slug>`                     | 客       | 商品一覧と商品ページ。数量を選んで「購入する」「当日払いで予約する」     |
| `/thanks`                                | 客       | Checkout から戻る先。注文ページへ進める                                  |
| `/orders/<token>`                        | 客       | 注文ページ(メールのリンク)。受け取り・入場の QR と番号、ダウンロード     |
| `/about`、`/tokushoho`                   | 客       | お店について・特定商取引法に基づく表記(中身は管理画面の「お店の設定」)   |
| `/admin`、`/admin/<slug>`                | 管理者   | 商品の一覧と、公開ページと同じ並びのまま書き換える編集画面               |
| `/admin/orders`                          | 管理者   | 全部の注文(オンライン・会場)。入金待ちがあれば `/admin` に札が出る       |
| `/admin/settings`                        | 管理者   | 店の名前・問い合わせ先・リンク・お店についての本文・特定商取引法の表記   |
| `/staff`                                 | スタッフ | スタッフのメニュー                                                       |
| `/staff/scan`                            | スタッフ | カメラで QR を読む。読めないときは 12 文字の番号を打つ                   |
| `/staff/o/<code>`                        | スタッフ | QR の中身。注文を見て受け取り・入場を記録、当日払いは代金を受けて記録    |
| `/staff/list?kind=goods`、`?kind=ticket` | スタッフ | 受け取り待ち・入場前の一覧(当日払いの未払いの合計つき)と、最近の受け渡し |
| `/staff/sell`、`/staff/square`           | スタッフ | 当日販売。現金で記録するか、Square POS で会計して戻る                    |
| `/api/stripe/webhook`、`/api/health`     | 機械     | Stripe の Webhook、死活確認                                              |

QR の中身は `<origin>/staff/o/<code>` の URL。スタッフの端末なら、カメラの QR リーダーで読んでも同じ画面が開く。
`code` は読み違えやすい文字(0 O 1 I l)を除いた 12 文字で、客が口で伝えることもできる。

## 注文の流れ

1. 商品ページの「購入する」で、注文を「決済前」で記録してから Stripe Checkout の Session を作って飛ばす。
   明細と値段はこちらの DB が持ち、Session の metadata には注文の番号だけを入れる
2. Stripe の Webhook が `/api/stripe/webhook` に届く。署名を確かめ、支払い済みなら注文を進めて
   **客に注文のメール**(ダウンロード商品は添付つき、注文ページのリンクつき)と**店に控え**を送る
3. コンビニ・銀行振込は `completed` が未払いで来るので「入金待ち」で記録だけし、
   `async_payment_succeeded` でメールを送る。`async_payment_failed` / `expired` は「未入金で終了」「失効」にする
   (Stripe 側で期限が切れるので、こちらから取り消す操作は無い)。決済画面を開いただけで閉じた注文は一覧に出さない
4. メールが送れなければ 500 を返し、Stripe の再送(最長 3 日)で送り直す。同じ Session が二度来てもメールは 1 回
5. 会場では、スタッフが QR を読んで受け取り・入場を記録する。2 台で同時に読んでも記録は 1 回(先に通ったほう)。
   読み違えたら取り消せる
6. 注文・入金待ち・メールの失敗を chat の incoming webhook に流す(`NOTIFY_WEBHOOK_URL`、無ければ黙る)

当日払いの予約と無料の申し込みは、Stripe を通さずに 1 で連絡先を聞き、そのまま注文ページへ進む(メールも送る)。
当日販売の現金は、記録した時点で支払い済み・受け渡し済み。Square は「会計待ち」で記録して Square POS を開き、
会計が済んで `/staff/square` に戻ってきたときに支払い済み・受け渡し済みにする。

## 管理者とスタッフのログイン(OIDC)

ライブラリは使わず、[`oidc.ts`](src/lib/server/oidc.ts) が discovery・authorize・token・jwks を素の fetch と WebCrypto で話す。
id_token は署名(RS256)・発行元・宛先・期限・nonce まで確かめる。誰を通すかは id_token のロールで決める。

| ロール(既定の値) | 環境変数          | 開ける画面                         |
| ---------------- | ----------------- | ---------------------------------- |
| `admin`          | `OIDC_ADMIN_ROLE` | `/admin` と `/staff`               |
| `staff`          | `OIDC_STAFF_ROLE` | `/staff`(受け取り・入場・当日販売) |

- ロールは既定で `roles` と `groups` の claim から読む。Keycloak の `realm_access.roles` のように別の場所にあるなら
  `OIDC_ROLE_CLAIM` に点でつないで書く。どちらのロールも無い人はログインで断る
- IdP に登録する戻り先は `<origin>/login/callback`。`OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`
  が揃わないと `/admin` と `/staff` は 404
- ログインの控えは DB に持つ(7 日)。ロールはログインしたときのものなので、外したら一度ログアウトさせる

IdP ごとの設定は [docs/deploy.md](docs/deploy.md)。

## 環境変数

[`.env.example`](.env.example) に全部ある。どれも空で起動でき、その機能だけが止まる(起動時のログに出る)。

| 変数                                                           | 中身                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DB_PATH`                                                      | SQLite のファイル(既定 `data/noren.db`)                                                  |
| `PRODUCTS_DIR`                                                 | 商品の画像と送るファイルの置き場(既定 `data/products`)                                   |
| `SAMPLE_PRODUCTS`                                              | `false` なら最初の起動で見本の商品を入れない                                             |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                  | Stripe のシークレットキーと Webhook の署名の鍵                                           |
| `STRIPE_API_URL`                                               | Stripe の API の向き先を変える(stripe-mock や e2e の偽 Stripe。本番では入れない)         |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD`      | 送信用の SMTP。587 は STARTTLS、465 は最初から TLS。`SMTP_HOST` が空なら送らずログに出す |
| `SMTP_STARTTLS`                                                | `false` で STARTTLS をしない(手元の捕まえ用サーバ向け)                                   |
| `MAIL_FROM` / `SHOP_MAIL_TO`                                   | 差出人と、注文の控えの宛先。空なら「お店の設定」の問い合わせ先                           |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`        | 管理者・スタッフのログイン                                                               |
| `OIDC_ADMIN_ROLE` / `OIDC_STAFF_ROLE` / `OIDC_ROLE_CLAIM`      | ロールの値と、ロールを読む claim                                                         |
| `OIDC_SCOPE`                                                   | 既定 `openid profile`                                                                    |
| `SQUARE_APPLICATION_ID` / `SQUARE_CALLBACK_URL`                | 当日販売の Square POS。戻り先の既定は `<origin>/staff/square`                            |
| `NOTIFY_WEBHOOK_URL`                                           | Mattermost / Slack の incoming webhook                                                   |
| `PORT` / `PROTOCOL_HEADER` / `HOST_HEADER` / `BODY_SIZE_LIMIT` | adapter-bun のもの。下の「本番」を参照                                                   |

店の名前・問い合わせ先・運営者・リンク・お店についての本文・特定商取引法の表記は、環境変数ではなく
管理画面の「お店の設定」で書く(DB の `setting` に入る)。何も書かないうちは見本の文が出る。

## 開発

```shell
bun install
cp .env.example .env   # 使うものだけ埋める
bun run dev            # http://localhost:5173
```

- Stripe の Webhook を手元に届けるには `stripe listen --forward-to localhost:5173/api/stripe/webhook`
  (表示される `whsec_…` を `STRIPE_WEBHOOK_SECRET` に)
- `SMTP_HOST` が空ならメールは送らず、内容を標準出力に出す
- データベースのテーブルは起動時に作る([`db.ts`](src/lib/server/db.ts))。マイグレーションの手順は無い

| コマンド           | 内容                                                     |
| ------------------ | -------------------------------------------------------- |
| `bun run dev`      | 開発サーバー                                             |
| `bun run build`    | 本番ビルド(`build/`)                                     |
| `bun run start`    | ビルド済みサーバーを起動                                 |
| `bun run check`    | 型チェック(svelte-check + TypeScript 7 / tsgo)           |
| `bun run lint`     | oxlint と書式の確認(`bun fmt --check`)                   |
| `bun run format`   | oxlint の自動修正と整形(`bun fmt`)                       |
| `bun run test`     | 単体テスト                                               |
| `bun run test:e2e` | e2e(Playwright。先に `bunx playwright install chromium`) |

## 本番

```shell
bun run build
DB_PATH=./data/noren.db PRODUCTS_DIR=./data/products bun ./build
```

- SvelteKit の CSRF 判定は、自分の origin とフォーム送信の `Origin` を突き合わせる。自分の origin は既定で
  リクエストの `Host` と `https` から求めるので、TLS を終端するリバースプロキシが `Host` をそのまま渡すなら設定は要らない。
  それ以外(平文 http で直に開く、`Host` を書き換える)は、**ビルド時**に `ORIGIN` を渡して `paths.origin` に埋め込むか、
  実行時に `PROTOCOL_HEADER` / `HOST_HEADER` を設定する(adapter-bun に実行時の `ORIGIN` は無い)
- 大きなファイルを管理画面から送るなら `BODY_SIZE_LIMIT` を上げる(Docker イメージは 4G)
- バックアップするのは `DB_PATH` の SQLite と `PRODUCTS_DIR` の中身

### Docker

```shell
docker compose up --build   # http://localhost:3000(.env があれば読む)
```

実行イメージは distroless の Bun(シェル無し)で、uid 1000:1000 で動く。
データは `/usr/src/app/data`(SQLite)と `/usr/src/app/files`(商品の画像とファイル)のボリューム。
公開ドメインで動かすときは `docker build --build-arg ORIGIN=https://shop.example.com .` か、前段で `Host` をそのまま渡す。

外まわり(Stripe のダッシュボード、IdP、SMTP、Square、リバースプロキシ)の設定は [docs/deploy.md](docs/deploy.md)。

## テスト

2 層。どちらも外への通信は無い。

|                    | 何を                                                                                                                                                                                                                                | どう                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test`     | richtext の sanitize、SMTP の会話、OIDC の token 検証とロール、商品と種類、注文の状態(Webhook・予約・受け渡し・Square)、ダウンロードの期限、お店の設定                                                                              | bun:test。偽 SMTP と偽 IdP はテスト内、Webhook は正しい署名で叩く                                                                              |
| `bun run test:e2e` | 管理者のログインとロール、種類ごとの商品の作成、Checkout からの購入(ダウンロード・物販・チケット)、メールの注文ページと QR、スタッフの受け取り・入場、当日払いの予約、当日販売(現金・Square)、入金待ち・入金・失効、axe(明暗の両方) | Playwright(Chromium)。[`e2e/serve.ts`](e2e/serve.ts) が偽 IdP・偽 Stripe の API・偽 SMTP・通知の受け口を立ててから `build/` のアプリを起動する |

e2e は `bun run build` してから。手元で何度も回すときは `bun e2e/serve.ts` を別に上げておけばビルドを待たない
(`reuseExistingServer`)。CI(`check.yml`)は lint → svelte-check → 単体 → e2e の順。

## ライセンス

[AGPL-3.0](LICENSE)
