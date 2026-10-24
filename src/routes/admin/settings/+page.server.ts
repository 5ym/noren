import { fail } from "@sveltejs/kit";

import { saveShop, SettingsError } from "#lib/server/settings.js";

import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    try {
      saveShop(form);
    } catch (e) {
      if (e instanceof SettingsError) return fail(400, { error: e.message });
      throw e;
    }
    return { ok: true };
  },
};
