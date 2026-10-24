import db from "./db";
import type { Role } from "./oidc";
import { randomToken } from "./random";

/** Cookie の名前。`__Host-` は http のときに付けられないので素の名前。 */
export const COOKIE = "noren_session";
/** ログインの途中(state / nonce / verifier)を預ける先。callback で使って捨てる */
export const PENDING_COOKIE = "noren_login";
export const PENDING_TTL = 10 * 60;
/** ログインの控えの寿命(秒)。7 日。スタッフの端末は共用されがちなので長くしすぎない */
export const SESSION_TTL = 7 * 24 * 60 * 60;

export interface Session {
  id: string;
  subject: string;
  name: string;
  role: Role;
  expiresAt: number;
}

export function create(subject: string, name: string, role: Role): Session {
  const id = randomToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL * 1000;
  db().run(
    "INSERT INTO session (id, subject, name, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
    [id, subject, name, role, now, expiresAt],
  );
  // ついでに切れたものを片付ける
  db().run("DELETE FROM session WHERE expiresAt <= ?", [now]);
  return { id, subject, name, role, expiresAt };
}

/** 生きている控えだけ返す。 */
export function find(id: string | undefined): Session | null {
  if (!id) return null;
  const row = db()
    .query<Session, [string]>(
      "SELECT id, subject, name, role, expiresAt FROM session WHERE id = ?",
    )
    .get(id);
  if (!row || row.expiresAt <= Date.now()) return null;
  return row.role === "admin" || row.role === "staff" ? row : null;
}

export function destroy(id: string | undefined): void {
  if (id) db().run("DELETE FROM session WHERE id = ?", [id]);
}
