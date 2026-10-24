/**
 * 出来事を chat の incoming webhook(Mattermost / Slack の `{"text": …}` 形式)へ流す。
 * NOTIFY_WEBHOOK_URL が空なら何もしない。
 *
 * **await しないこと。** 通知は投げっぱなしで、相手が落ちていても Stripe への
 * 応答は返す(納品の成否はメールで決まり、通知はその報告にすぎない)。失敗はログだけ。
 */
export function notify(text: string): void {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
  if (!url) return;
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => {
      if (!res.ok)
        console.error(`[notify] 通知先が ${res.status} を返しました`);
    })
    .catch((e) => {
      console.error("[notify] 通知の送信に失敗しました", e);
    });
}
