import { listOrders } from "#lib/server/purchase.js";

import type { PageServerLoad } from "./$types";

/** 注文一覧。入金待ちを先に、あとは新しい順(purchase.ts)。会場で売ったものも入る */
export const load: PageServerLoad = () => ({ orders: listOrders() });
