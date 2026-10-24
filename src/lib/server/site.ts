/**
 * メール・Stripe の戻り先・QR に書く、このサイトの origin。PUBLIC_URL があればそれを使い、
 * 無ければリクエストの origin(Host と PROTOCOL_HEADER から組まれる)。
 *
 * 本番では PUBLIC_URL を入れる: リクエストの Host は客が書き換えられるので、それをそのまま
 * メールのリンクにすると、他人宛のメールに別のドメインのリンクを載せられてしまう。
 */
export function siteOrigin(url: URL): string {
  const fixed = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  return fixed ? new URL(fixed).origin : url.origin;
}
