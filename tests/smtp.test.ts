import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";

import {
  addressOf,
  buildMime,
  encodeHeaderWord,
  sendSmtp,
} from "../src/lib/server/smtp";
import { TMP } from "./setup";

/**
 * 最低限の SMTP サーバ。受け取ったコマンドと DATA の本文を記録する。
 * STARTTLS は無し(証明書が要る)。本物との TLS 手順は手で実際の SMTP サーバ
 * (587 番の STARTTLS)に向けて確かめる。
 */
function fakeServer() {
  const commands: string[] = [];
  let data = "";
  const server = createServer((socket: Socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        const end = buffer.indexOf("\r\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 queued\r\n");
          } else {
            data += `${line}\r\n`;
          }
          continue;
        }
        commands.push(line);
        const verb = line.split(" ")[0].toUpperCase();
        if (verb === "EHLO") {
          socket.write(
            "250-fake\r\n250-AUTH LOGIN XOAUTH2\r\n250 SIZE 157286400\r\n",
          );
        } else if (line === "AUTH LOGIN") {
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (commands.at(-2) === "AUTH LOGIN") {
          socket.write("334 UGFzc3dvcmQ6\r\n");
        } else if (commands.at(-3) === "AUTH LOGIN") {
          socket.write(
            line === Buffer.from("secret").toString("base64")
              ? "235 2.7.0 Authentication successful\r\n"
              : "535 5.7.3 Authentication unsuccessful\r\n",
          );
        } else if (verb === "MAIL" || verb === "RCPT") {
          socket.write("250 OK\r\n");
        } else if (verb === "DATA") {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (verb === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("500 what\r\n");
        }
      }
    });
  });
  return {
    commands,
    data: () => data,
    listen: () =>
      new Promise<number>((resolve) =>
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : 0);
        }),
      ),
    close: () => server.close(),
  };
}

const decodeWords = (s: string) =>
  s
    .split(/\r\n\s/)
    .map((w) => {
      const m = w.match(/^=\?UTF-8\?B\?(.*)\?=$/);
      return m ? Buffer.from(m[1], "base64").toString("utf8") : w;
    })
    .join("");

describe("mime", () => {
  test("日本語の件名は文字の境目で複数の encoded-word に割れる", () => {
    const subject =
      "【Sample Shop】見本のダウンロード商品 をお送りします、ありがとうございます";
    const encoded = encodeHeaderWord(subject);
    for (const word of encoded.split("\r\n "))
      expect(word.length).toBeLessThanOrEqual(75);
    expect(decodeWords(encoded)).toBe(subject);
    expect(encodeHeaderWord("plain ascii")).toBe("plain ascii");
  });

  test("From の表示名だけ encode し、アドレスは残す", () => {
    const mime = buildMime(
      "Sample Shop <shop@example.test>",
      { to: "buyer@example.test", subject: "件名", text: "本文" },
      new Date(0),
      "fixed-id",
    );
    expect(mime).toContain("From: Sample Shop <shop@example.test>\r\n");
    expect(mime).toContain("Subject: =?UTF-8?B?5Lu25ZCN?=\r\n");
    expect(mime).toContain("Message-ID: <fixed-id@example.test>\r\n");
    expect(mime).toContain("Content-Type: text/plain; charset=utf-8\r\n");
    expect(mime).not.toContain("multipart");
    expect(addressOf("見本の店 <shop@example.test>")).toBe("shop@example.test");
    expect(addressOf("shop@example.test")).toBe("shop@example.test");
  });
});

describe("smtp", () => {
  test("EHLO → AUTH LOGIN → MAIL/RCPT → DATA → QUIT の順に話し、添付が届く", async () => {
    const server = fakeServer();
    const port = await server.listen();
    const file = join(TMP, "添付.zip");
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x2e, 0x0a, 0x2e]);
    writeFileSync(file, bytes);
    try {
      await sendSmtp(
        {
          host: "127.0.0.1",
          port,
          user: "shop@example.test",
          pass: "secret",
          from: "Sample <shop@example.test>",
          starttls: false,
        },
        {
          to: "buyer@example.test",
          subject: "納品",
          text: "こんにちは\r\n.先頭がドットの行\r\n",
          attachments: [{ filename: "添付.zip", path: file }],
        },
      );
    } finally {
      server.close();
    }
    const verbs = server.commands.map((c) => c.split(" ")[0]);
    expect(verbs).toEqual([
      "EHLO",
      "AUTH",
      "c2hvcEBleGFtcGxlLnRlc3Q=",
      "c2VjcmV0",
      "MAIL",
      "RCPT",
      "DATA",
      "QUIT",
    ]);
    expect(server.commands).toContain("MAIL FROM:<shop@example.test>");
    expect(server.commands).toContain("RCPT TO:<buyer@example.test>");

    const data = server.data();
    expect(data).toContain("Content-Type: multipart/mixed;");
    expect(data).toContain("filename*=UTF-8''%E6%B7%BB%E4%BB%98.zip");
    // 添付は base64 で元のバイト列に戻る
    const b64 = data
      .split("Content-Disposition: attachment")[1]
      .split("\r\n\r\n")[1]
      .split("\r\n--")[0];
    expect(Buffer.from(b64.replace(/\r\n/g, ""), "base64")).toEqual(bytes);
    // 本文は base64 なので、ドットで始まる行はそのまま届く
    const text = data
      .split("Content-Transfer-Encoding: base64\r\n\r\n")[1]
      .split("\r\n--")[0];
    expect(
      Buffer.from(text.replace(/\r\n/g, ""), "base64").toString(),
    ).toContain(".先頭がドットの行");
  });

  test("認証に失敗したら投げる", async () => {
    const server = fakeServer();
    const port = await server.listen();
    try {
      await expect(
        sendSmtp(
          {
            host: "127.0.0.1",
            port,
            user: "x",
            pass: "wrong",
            from: "a@b",
            starttls: false,
          },
          { to: "c@d", subject: "s", text: "t" },
        ),
      ).rejects.toThrow(/535/);
    } finally {
      server.close();
    }
  });
});
