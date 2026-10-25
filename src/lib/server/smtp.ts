import { readFileSync } from "node:fs";
import { connect as netConnect, type Socket } from "node:net";
import { hostname } from "node:os";
import { connect as tlsConnect } from "node:tls";

/**
 * SMTP サーバ(送信用のリレー)に 1 通渡すためだけのクライアント。nodemailer は 2MB あって、
 * 使うのはこの経路ひとつなので自前にした。
 *
 * やること: EHLO → STARTTLS → EHLO → AUTH LOGIN → MAIL FROM → RCPT TO → DATA → QUIT。
 * 認証は AUTH LOGIN だけ(Exchange Online が広告するのが LOGIN と XOAUTH2 だけで、
 * 多くのサーバも LOGIN を受ける)。465 番は最初から TLS(implicit TLS)。
 * SMTP_USER が空なら認証しない(手元の捕まえ用サーバや、IP で許可するリレー向け)。
 */

export type Attachment = { filename: string; path: string };

export type Message = {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
};

export interface SmtpOptions {
  host: string;
  port: number;
  /** 省略すると認証しない(手元の捕まえ用サーバ向け) */
  user?: string;
  pass?: string;
  /** "Name <addr>" でも addr だけでもよい */
  from: string;
  /** 587 の既定は true。テスト用の平文サーバに向けるときだけ false */
  starttls?: boolean;
  timeoutMs?: number;
}

/** サーバの応答 1 つ。複数行 ("250-...") はまとめて 1 つ。 */
interface Reply {
  code: number;
  lines: string[];
}

class Connection {
  private buffer = "";
  private waiting: ((r: Reply) => void) | undefined;
  private failed: ((e: Error) => void) | undefined;
  private pending: Reply[] = [];

  constructor(
    private socket: Socket,
    private timeoutMs: number,
  ) {
    this.attach(socket);
  }

  /** STARTTLS 後に socket が入れ替わるので、購読を張り直せるようにしてある。 */
  private attach(socket: Socket): void {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeoutMs, () =>
      this.fail(new Error("SMTP: サーバの応答がタイムアウトしました")),
    );
    socket.on("data", (chunk: string) => this.feed(chunk));
    socket.on("error", (e) => this.fail(e));
    socket.on("close", () =>
      this.fail(new Error("SMTP: サーバが接続を閉じました")),
    );
  }

  private feed(chunk: string): void {
    this.buffer += chunk;
    let lines: string[] = [];
    for (;;) {
      const end = this.buffer.indexOf("\r\n");
      if (end < 0) break;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      lines.push(line.slice(4));
      // "250-" は続きがある、"250 " で終わり。3 桁だけの行もある
      if (line.length < 4 || line[3] === " ") {
        const reply = { code: Number(line.slice(0, 3)), lines };
        lines = [];
        if (this.waiting) {
          const resolve = this.waiting;
          this.waiting = undefined;
          this.failed = undefined;
          resolve(reply);
        } else {
          this.pending.push(reply);
        }
      }
    }
  }

  private fail(e: Error): void {
    if (this.failed) {
      const reject = this.failed;
      this.waiting = undefined;
      this.failed = undefined;
      reject(e);
    }
  }

  read(): Promise<Reply> {
    const queued = this.pending.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      this.waiting = resolve;
      this.failed = reject;
    });
  }

  /**
   * コマンドを送って応答を待つ。期待した code でなければ投げる。エラーに出すのは
   * 固定の label だけで、送った行(パスワードや宛先が入る)は出さない。
   */
  async command(line: string, expect: number, label: string): Promise<Reply> {
    this.socket.write(`${line}\r\n`);
    const reply = await this.read();
    if (reply.code !== expect) {
      throw new Error(
        `SMTP ${label}: ${reply.code} ${reply.lines.join(" / ")}`,
      );
    }
    return reply;
  }

  /** 応答の code だけ見て、複数の候補を許す(RCPT TO は 250 か 251)。 */
  async commandAny(line: string, expects: number[], label: string) {
    this.socket.write(`${line}\r\n`);
    const reply = await this.read();
    if (!expects.includes(reply.code)) {
      throw new Error(
        `SMTP ${label}: ${reply.code} ${reply.lines.join(" / ")}`,
      );
    }
    return reply;
  }

  /** 応答を待たずに生データを流す(DATA の本文)。 */
  write(data: string): void {
    this.socket.write(data);
  }

  async upgradeToTls(servername: string): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("error");
    plain.removeAllListeners("close");
    plain.setTimeout(0);
    const secure = tlsConnect({ socket: plain, servername });
    await new Promise<void>((resolve, reject) => {
      secure.once("secureConnect", () => resolve());
      secure.once("error", reject);
    });
    this.buffer = "";
    this.attach(secure);
  }

  destroy(): void {
    this.socket.destroy();
  }
}

/** "Name <addr>" から addr を、無ければそのまま。 */
export function addressOf(mailbox: string): string {
  const m = mailbox.match(/<([^>]+)>\s*$/);
  return (m ? m[1] : mailbox).trim();
}

const B64_LINE = 76;

function base64Lines(data: Buffer | string): string {
  const b64 = Buffer.from(data).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += B64_LINE) {
    lines.push(b64.slice(i, i + B64_LINE));
  }
  return lines.join("\r\n");
}

/**
 * RFC 2047 の encoded-word。ASCII だけならそのまま。1 語 75 文字までなので、
 * 長い件名は文字の境目で切って複数の語にする(bytes を途中で切ると文字が壊れる)。
 */
export function encodeHeaderWord(value: string): string {
  if (!/[^\x20-\x7e]/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    // base64 は 3 バイト → 4 文字。"=?UTF-8?B?" + "?=" の 12 文字を引いて 45 バイトまで
    if (Buffer.byteLength(chunk + ch) > 45) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
  return words.join("\r\n ");
}

/** "Name <addr>" の Name 部分だけ encoded-word にする。 */
function encodeMailbox(mailbox: string): string {
  const m = mailbox.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (!m?.[1]) return mailbox.trim();
  return `${encodeHeaderWord(m[1].replace(/^"|"$/g, ""))} <${m[2]}>`;
}

/** ASCII だけ残した filename。filename* を読めない古い MUA 向けの控え。 */
const asciiName = (name: string) =>
  name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

/**
 * メール本文(ヘッダ込み)を組む。本文は base64 の text/plain、添付は
 * application/octet-stream。行末は CRLF。
 */
export function buildMime(
  from: string,
  message: Message,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): string {
  const attachments = message.attachments ?? [];
  const domain = addressOf(from).split("@")[1] ?? "localhost";
  const headers = [
    `From: ${encodeMailbox(from)}`,
    `To: ${encodeMailbox(message.to)}`,
    `Subject: ${encodeHeaderWord(message.subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  const textPart = [
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.text),
  ].join("\r\n");

  if (attachments.length === 0) {
    return `${headers.join("\r\n")}\r\n${textPart}\r\n`;
  }

  const boundary = `=_noren_${id.replace(/-/g, "")}`;
  const parts = [
    textPart,
    ...attachments.map((a) =>
      [
        `Content-Type: application/octet-stream; name="${asciiName(a.filename)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${asciiName(a.filename)}";`,
        ` filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "",
        base64Lines(readFileSync(a.path)),
      ].join("\r\n"),
    ),
  ];
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    "This is a multi-part message in MIME format.",
    ...parts.map((p) => `--${boundary}\r\n${p}`),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** DATA の中で "." だけの行は終端なので、先頭が "." の行は ".." にする(透過性)。 */
const dotStuff = (body: string) => body.replace(/(^|\r\n)\./g, "$1..");

export async function sendSmtp(
  options: SmtpOptions,
  message: Message,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const implicitTls = options.port === 465;
  const socket = implicitTls
    ? tlsConnect({
        host: options.host,
        port: options.port,
        servername: options.host,
      })
    : netConnect({ host: options.host, port: options.port });
  const conn = new Connection(socket, timeoutMs);
  const me = hostname() || "localhost";
  try {
    const greeting = await conn.read();
    if (greeting.code !== 220) {
      throw new Error(
        `SMTP greeting: ${greeting.code} ${greeting.lines.join(" / ")}`,
      );
    }
    await conn.command(`EHLO ${me}`, 250, "EHLO");
    if (!implicitTls && options.starttls !== false) {
      await conn.command("STARTTLS", 220, "STARTTLS");
      await conn.upgradeToTls(options.host);
      await conn.command(`EHLO ${me}`, 250, "EHLO");
    }
    if (options.user) {
      await conn.command("AUTH LOGIN", 334, "AUTH LOGIN");
      await conn.command(
        Buffer.from(options.user).toString("base64"),
        334,
        "AUTH LOGIN (user)",
      );
      // ログにパスワードが出ないよう、ラベルは固定文字列
      await conn.command(
        Buffer.from(options.pass ?? "").toString("base64"),
        235,
        "AUTH LOGIN (password)",
      );
    }
    await conn.command(
      `MAIL FROM:<${addressOf(options.from)}>`,
      250,
      "MAIL FROM",
    );
    await conn.commandAny(
      `RCPT TO:<${addressOf(message.to)}>`,
      [250, 251],
      "RCPT TO",
    );
    await conn.command("DATA", 354, "DATA");
    conn.write(`${dotStuff(buildMime(options.from, message))}\r\n.\r\n`);
    const accepted = await conn.read();
    if (accepted.code !== 250) {
      throw new Error(
        `SMTP DATA: ${accepted.code} ${accepted.lines.join(" / ")}`,
      );
    }
    await conn.command("QUIT", 221, "QUIT").catch(() => {
      // 受理された後なので、QUIT の失敗は結果を変えない
    });
  } finally {
    conn.destroy();
  }
}
