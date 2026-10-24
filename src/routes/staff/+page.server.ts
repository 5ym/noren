import { awaitingHand } from "#lib/server/purchase.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  name: locals.user?.name ?? "",
  goods: awaitingHand("goods").length,
  tickets: awaitingHand("ticket").length,
  square: Boolean(process.env.SQUARE_APPLICATION_ID),
});
