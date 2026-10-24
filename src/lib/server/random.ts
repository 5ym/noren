/** 推測できない文字列(base64url)。state・nonce・セッション ID・注文ページの鍵に使う。 */
export const randomToken = (bytes = 32) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
    "base64url",
  );

/** 受け取り・入場の番号に使う文字。読み違えやすい 0 O 1 I l を除く(order.ts の CODE と同じ) */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** QR に入れる番号。12 文字で約 70 ビット。偏りが出ないよう、余りの出る値は捨てて引き直す */
export function randomCode(length = 12): string {
  let out = "";
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length)
        out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}
