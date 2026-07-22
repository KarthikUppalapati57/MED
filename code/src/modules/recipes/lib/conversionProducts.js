import { api } from '@/lib/apiClient';
import { getProductCostUnit } from '@/modules/recipes/lib/recipeUnits';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

async function listProductsFallback() {
  try {
    return await api.entities.Product.list('name', {
      limit: 1000,
      select: 'id, name, latest_price, base_unit, report_by_unit, category, product_id, organization_id',
    });
  } catch (fallbackError) {
    const fallbackMessage = String(fallbackError?.message || '');
    if (fallbackMessage.includes('category') || fallbackMessage.includes('product_id')) {
      return api.entities.Product.list('name', {
        limit: 1000,
        select: 'id, name, latest_price, base_unit, report_by_unit, organization_id',
      });
    }
    throw fallbackError;
  }
}

/**
 * Load purchased products for recipe unit conversions.
 * Uses the same get_product_catalog RPC + active hierarchy as the Products module.
 */
export async function loadConversionCatalogProducts(organizationId, {
  brandId = null,
  locationId = null,
  maxPages = 20,
} = {}) {
  if (!organizationId) return [];

  // RPC clamps page size to 100 (get_product_catalog).
  const pageSize = 100;
  const rows = [];
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const batch = await api.products.getCatalog({
        organizationId,
        brandId: brandId || null,
        locationId: locationId || null,
        sortBy: 'name',
        page,
        pageSize,
      });
      if (!batch?.length) break;
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
  } catch (error) {
    console.warn('[conversionProducts] catalog RPC failed, falling back to Product.list', error);
    const fallback = await listProductsFallback();
    return normalizeConversionProducts(fallback || []);
  }

  if (!rows.length) {
    try {
      const fallback = await listProductsFallback();
      if (fallback?.length) {
        return normalizeConversionProducts(fallback);
      }
    } catch {
      // Keep empty catalog result.
    }
  }

  return normalizeConversionProducts(rows);
}

function normalizeConversionProducts(products) {
  return (products || []).map((row) => ({
    ...row,
    vendor_name: row.vendor_name || row.primary_vendor_name || null,
  }));
}

/** Merge catalog rows with optional local seeds (e.g. Product detail form values). */
export function mergeConversionProducts(catalog = [], seeds = []) {
  const byId = new Map();
  for (const product of catalog) {
    if (product?.id) byId.set(product.id, product);
  }
  for (const seed of seeds) {
    if (!seed?.id) continue;
    byId.set(seed.id, { ...byId.get(seed.id), ...seed });
  }
  return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/** Dropdown label: Name — Purchased Unit — $Cost (+ SKU/vendor when present). */
export function formatConversionProductOption(product) {
  if (!product) return 'Unknown product';
  const unit = getProductCostUnit(product) || '—';
  const price = Number(product.latest_price);
  const priceLabel = Number.isFinite(price) ? money.format(price) : '—';
  const parts = [product.name || 'Unnamed product', unit, priceLabel];
  const sku = product.product_id || product.sku || null;
  const vendor = product.vendor_name || product.primary_vendor_name || null;
  if (sku) parts.push(`SKU ${sku}`);
  if (vendor) parts.push(vendor);
  return parts.join(' — ');
}

export function resolveConversionProductName(productMap, productId) {
  if (!productId) return '—';
  return productMap?.get?.(productId)?.name || 'Unknown product';
}
