import { listProducts } from "#lib/server/products.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({ products: listProducts() });
