import { error, fail, redirect } from "@sveltejs/kit";

import {
  addVariants,
  deleteProduct,
  getProduct,
  moveImage,
  moveVariant,
  ProductError,
  removeFile,
  removeImage,
  removeVariant,
  renameVariant,
  saveImage,
  updateProduct,
} from "#lib/server/products.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ params }) => {
  const product = getProduct(params.slug);
  if (!product) error(404, "商品が見つかりません");
  return { product };
};

/** ProductError は画面に出す。それ以外は 500 のまま。 */
async function guarded(run: () => Promise<void> | void) {
  try {
    await run();
  } catch (e) {
    if (e instanceof ProductError) return fail(400, { error: e.message });
    throw e;
  }
  return { ok: true };
}

export const actions: Actions = {
  update: async ({ params, request }) => {
    const form = await request.formData();
    return guarded(() => {
      updateProduct(params.slug, {
        name: form.get("name"),
        price: form.get("price"),
        listPrice: form.get("listPrice"),
        description: form.get("description"),
        windowsOnly: form.get("windowsOnly"),
        payOnSite: form.get("payOnSite"),
        active: form.get("active"),
        sortOrder: form.get("sortOrder"),
      });
    });
  },
  // 複数まとめて。選んだ順に末尾へ足す
  image: async ({ params, request }) => {
    const form = await request.formData();
    const files = form
      .getAll("image")
      .filter((f): f is File => f instanceof File && f.size > 0);
    return guarded(async () => {
      if (files.length === 0) throw new ProductError("画像を選んでください");
      for (const file of files) await saveImage(params.slug, file);
    });
  },
  removeImage: async ({ params, request }) => {
    const form = await request.formData();
    return guarded(() =>
      removeImage(params.slug, String(form.get("name") ?? "")),
    );
  },
  moveImage: async ({ params, request }) => {
    const form = await request.formData();
    const dir = form.get("dir") === "-1" ? -1 : 1;
    return guarded(() =>
      moveImage(params.slug, String(form.get("name") ?? ""), dir),
    );
  },
  // 種類(サイズなど)。1 行に 1 つ、まとめて足せる
  addVariants: async ({ params, request }) => {
    const form = await request.formData();
    return guarded(() => addVariants(params.slug, form.get("names")));
  },
  renameVariant: async ({ params, request }) => {
    const form = await request.formData();
    return guarded(() =>
      renameVariant(params.slug, form.get("id"), form.get("name")),
    );
  },
  removeVariant: async ({ params, request }) => {
    const form = await request.formData();
    return guarded(() => removeVariant(params.slug, form.get("id")));
  },
  moveVariant: async ({ params, request }) => {
    const form = await request.formData();
    const dir = form.get("dir") === "-1" ? -1 : 1;
    return guarded(() => moveVariant(params.slug, form.get("id"), dir));
  },
  removeFile: async ({ params, request }) => {
    const form = await request.formData();
    return guarded(() =>
      removeFile(params.slug, String(form.get("file") ?? "")),
    );
  },
  remove: async ({ params, request }) => {
    const form = await request.formData();
    if (form.get("confirm") !== params.slug) {
      return fail(400, {
        error: "削除するには slug をそのまま入力してください",
      });
    }
    deleteProduct(params.slug);
    redirect(303, "/admin");
  },
};
