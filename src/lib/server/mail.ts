import { shop } from "./settings";
import { type Message, sendSmtp } from "./smtp";

export type { Attachment, Message } from "./smtp";
export type Sender = (message: Message) => Promise<void>;

/**
 * 環境変数の SMTP で 1 通送る。SMTP_HOST が空なら送らず、中身を標準出力に出すだけ
 * (手元の開発用)。差出人は MAIL_FROM、無ければ店の問い合わせ先。
 */
export const sendMail: Sender = async (message) => {
  const host = process.env.SMTP_HOST;
  const from = process.env.MAIL_FROM || shop().email;
  if (!host) {
    const { attachments, ...rest } = message;
    console.log("[mail] SMTP_HOST が空なので送っていません:", {
      from,
      ...rest,
      attachments: attachments?.map((a) => a.filename),
    });
    return;
  }
  if (!from)
    throw new Error("MAIL_FROM(または店の問い合わせ先)が設定されていません");
  await sendSmtp(
    {
      host,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASSWORD,
      from,
      starttls: process.env.SMTP_STARTTLS !== "false",
    },
    message,
  );
};
