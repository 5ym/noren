import { shop } from "#lib/server/settings.js";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => ({
  // ログインしている人にだけ「スタッフ」「管理」を出すため。名前は出さない
  role: locals.user?.role ?? null,
  shop: shop(),
});
