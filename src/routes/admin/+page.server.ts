import { fail, redirect } from "@sveltejs/kit";

import {
  createProduct,
  listProducts,
  ProductError,
} from "#lib/server/products.js";
import { countPending } from "#lib/server/purchase.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  products: listProducts(true),
  name: locals.user?.name ?? "",
  pending: countPending(),
});

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    try {
      const product = createProduct({
        slug: form.get("slug"),
        name: form.get("name"),
        price: form.get("price"),
        kind: form.get("kind"),
      });
      redirect(303, `/admin/${product.slug}`);
    } catch (e) {
      if (e instanceof ProductError) {
        return fail(400, {
          error: e.message,
          slug: String(form.get("slug") ?? ""),
          name: String(form.get("name") ?? ""),
          price: String(form.get("price") ?? ""),
          kind: String(form.get("kind") ?? "download"),
        });
      }
      throw e;
    }
  },
};
