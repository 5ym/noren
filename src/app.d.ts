/// <reference types="vite/client" />

declare global {
  namespace App {
    interface Locals {
      /** ログイン済みの管理者・スタッフ。hooks.server.ts が入れる */
      user?: { subject: string; name: string; role: "admin" | "staff" };
    }
  }
}

export {};
