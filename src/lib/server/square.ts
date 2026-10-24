/**
 * Square POS アプリを開く URL(Android の intent。Square POS API の Web 版)。
 * 会計が終わると Square が callback へ戻し、REQUEST_METADATA に入れた注文の番号で
 * 会計待ちの注文を済ませる(/staff/square)。
 */
export function squareUrl(
  code: string,
  amount: number,
  applicationId: string,
  callback: string,
): string {
  return [
    "intent:#Intent",
    "action=com.squareup.pos.action.CHARGE",
    "package=com.squareup",
    `S.com.squareup.pos.WEB_CALLBACK_URI=${callback}`,
    `S.com.squareup.pos.CLIENT_ID=${applicationId}`,
    "S.com.squareup.pos.API_VERSION=v2.0",
    `i.com.squareup.pos.TOTAL_AMOUNT=${amount}`,
    "S.com.squareup.pos.CURRENCY_CODE=JPY",
    "S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD,com.squareup.pos.TENDER_CASH",
    "l.com.squareup.pos.AUTO_RETURN_TIMEOUT_MS=3200",
    `S.com.squareup.pos.REQUEST_METADATA=${code}`,
    "end",
  ].join(";");
}
