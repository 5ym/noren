import QRCode from "qrcode";

/** スタッフが読む URL。端末のカメラの QR リーダーで読んでも、スタッフ画面の注文が開く */
export const staffUrl = (origin: string, code: string) =>
  `${origin}/staff/o/${code}`;

/**
 * QR コードの SVG。サーバで作って HTML に埋めるので、JS が無くても出る。
 * 中身はこちらで作った URL だけ(客の入力は入らない)。
 */
export const qrSvg = (text: string) =>
  QRCode.toString(text, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
