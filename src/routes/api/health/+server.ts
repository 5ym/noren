import { json } from "@sveltejs/kit";

import db from "#lib/server/db.js";

import type { RequestHandler } from "./$types";

// Kubernetes probes this during a rolling update: a new pod only joins the
// Service once it answers, so the old pod keeps serving until the replacement
// can reach the database on the shared volume.
export const GET: RequestHandler = () => {
  db().query("SELECT 1").get();
  return json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
};
