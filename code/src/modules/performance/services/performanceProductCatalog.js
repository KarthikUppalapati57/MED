const PRODUCT_CATALOG_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;

/**
 * Load every product visible in one active hierarchy context.
 *
 * get_product_catalog is the existing authoritative product read path. It
 * includes organization-shared, active-brand-shared, and exact-location rows.
 * Performance must not use Product.list here because the generic entity client
 * injects exact scope columns and removes inherited products.
 */
export async function loadPerformanceProductCatalog({
  productsApi,
  organizationId,
  brandId,
  locationId,
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  if (!organizationId || !brandId || !locationId) {
    throw new Error('Performance product coverage requires organization, brand, and location context.');
  }
  if (!productsApi?.getCatalog) {
    throw new Error('Performance product catalog API is unavailable.');
  }

  const productsById = new Map();

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await productsApi.getCatalog({
      organizationId,
      brandId,
      locationId,
      search: null,
      sortBy: 'name',
      page,
      pageSize: PRODUCT_CATALOG_PAGE_SIZE,
    });

    for (const product of batch || []) {
      if (product?.id) productsById.set(product.id, product);
    }

    if (!batch?.length || batch.length < PRODUCT_CATALOG_PAGE_SIZE) {
      return [...productsById.values()];
    }
  }

  throw new Error(
    `Performance product coverage exceeded ${maxPages * PRODUCT_CATALOG_PAGE_SIZE} visible products. `
      + 'A server-side aggregate is required before coverage can be reported safely.'
  );
}

export { PRODUCT_CATALOG_PAGE_SIZE };
