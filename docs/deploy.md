# 本番の設定

コードの説明は [README](../README.md)。ここはアプリの外側(Stripe・IdP・SMTP・Square・前段のプロキシ・バックアップ)。
例のドメインは `shop.example.com` にしてある。

## Stripe

| どこ                         | 何を                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 開発者 → API キー            | シークレットキー(`sk_live_…`)を `STRIPE_SECRET_KEY` に。制限付きキーにするなら Checkout Sessions の書き込みと PaymentIntents の読み取り                                                                                                                                                               |
| 開発者 → Webhook             | 送り先 `https://shop.example.com/api/stripe/webhook`。イベントは `checkout.session.completed` / `async_payment_succeeded` / `async_payment_failed` / `expired` の 4 つ。後ろ 2 つが無いと入金待ちの注文が「入金待ち」のまま残る。作ったときの署名シークレット(`whsec_…`)を `STRIPE_WEBHOOK_SECRET` に |
| 設定 → 支払い方法            | Checkout に出るのはここで有効にしたもの。コンビニ払い・銀行振込のように入金待ちになる方法は、入金後に `async_payment_succeeded` が来るまでメールを送らない                                                                                                                                            |
| 設定 → ビジネス → 送信メール | 「決済成功時」の領収書。注文のメールはアプリ、領収書は Stripe から別の 1 通                                                                                                                                                                                                                           |
| 商品・価格                   | Stripe 側に登録しない(`price_data` で毎回渡す)。値段はアプリの商品だけが持つ                                                                                                                                                                                                                          |

前段に Cloudflare などの WAF を置くなら、Stripe からの Webhook の POST をチャレンジしないこと
(ボット対策で弾かれると、決済は通ったのにメールが出ない壊れ方をする)。

## 管理者とスタッフのログイン(OIDC)

どの IdP でも、やることは同じ:

1. Web アプリ(confidential client)を作り、戻り先に `https://shop.example.com/login/callback` を入れる
2. クライアント ID とシークレットを `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` に、issuer の URL を `OIDC_ISSUER` に
   (`<issuer>/.well-known/openid-configuration` が開ける URL)
3. 管理者に `admin`、スタッフに `staff` のロール(値は `OIDC_ADMIN_ROLE` / `OIDC_STAFF_ROLE` で変えられる)を割り当て、
   id_token に載るようにする。id_token の署名は RS256 だけ受ける

| IdP               | ロールの載せ方                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entra ID          | アプリの登録に「アプリ ロール」`admin` と `staff` を作り、エンタープライズ アプリケーションでユーザーかグループに割り当てる。id_token の `roles` に載る(既定のままでよい)    |
| Keycloak          | レルムのロール `admin` / `staff` を作って割り当て、`OIDC_ROLE_CLAIM=realm_access.roles`。id_token に載らないときはクライアント スコープ `roles` のマッパーで id_token に足す |
| groups を出す IdP | グループの名前を `admin` / `staff` にする(または `OIDC_ADMIN_ROLE` / `OIDC_STAFF_ROLE` をグループ名に)。ロールは `roles` と `groups` の両方から読む                          |

ログインに失敗すると、理由(ロールが無い・署名が合わない など)を画面に出す。ロールを外した人は、
ログインの控え(最長 7 日)が切れるまで入れるので、すぐ止めたいときは DB の `session` からその行を消す。

## メール(SMTP)

送信用の SMTP なら何でもよい(Microsoft 365 / Google Workspace の SMTP リレー、Amazon SES、Postmark、自前の Postfix など)。

- 587 番は STARTTLS、465 番は最初から TLS。認証は AUTH LOGIN(`SMTP_USER` / `SMTP_PASSWORD`)。
  `SMTP_USER` を空にすると認証しない(IP で許可するリレー向け)
- 差出人(`MAIL_FROM`)のドメインには SPF・DKIM・DMARC を設定しておく。届かない・迷惑メールに入るのはたいていここ
- 添付は合計 20MB まで。それより大きいダウンロード商品はリンクだけ送る

## Square POS(当日販売、任意)

Square の開発者ダッシュボードでアプリを作り、アプリケーション ID を `SQUARE_APPLICATION_ID` に。
「Point of Sale API」の Web の戻り先(Web callback URL)に `https://shop.example.com/staff/square` を登録する
(別の URL にするなら `SQUARE_CALLBACK_URL`)。スタッフの Android 端末に Square POS アプリを入れ、同じアカウントでログインしておく。
会計の画面は Android の intent で開くので、iOS では使えない(現金の記録は使える)。

## 前段のプロキシ

- `Host` をそのまま渡し、`X-Forwarded-Proto` を付けるなら `PROTOCOL_HEADER=x-forwarded-proto`
  (付けないなら https として扱う)。`Host` を書き換えるなら `HOST_HEADER` も。どちらも合わないと、
  フォームの送信が SvelteKit の CSRF 判定で 403 になる。固定したいときはビルド時の `ORIGIN`
- 管理画面から大きなファイルを送るなら、プロキシ側の本文の上限とタイムアウトも上げる
  (アプリの進み具合はブラウザ → サーバの送信までで、100% のあとの「サーバで保存しています」はディスクへの書き込み)
- `CONNECTION_IDLE_TIMEOUT`(Docker イメージは 255 秒)は、何も流れない接続を切るまでの秒数。
  Webhook でメールを送る間や、大きなファイルを書き切る間に切れないように長めにしてある

## データとバックアップ

| 何を                     | どこ(Docker イメージ)        |
| ------------------------ | ---------------------------- |
| SQLite(商品・注文・設定) | `/usr/src/app/data/noren.db` |
| 商品の画像と送るファイル | `/usr/src/app/files`         |

SQLite は WAL で動いている。動かしたまま写すなら `sqlite3 noren.db ".backup out.db"` か、
`bun -e 'new (require("bun:sqlite").Database)("noren.db").exec("VACUUM INTO \"out.db\"")'`
(distroless のイメージにシェルは無いが `bun` は呼べる)。

複数のプロセスで同じ DB を開くのは、入れ替えの数秒間だけを想定している(`busy_timeout` で待つ)。
台数を増やして同時に動かす作りではない。
