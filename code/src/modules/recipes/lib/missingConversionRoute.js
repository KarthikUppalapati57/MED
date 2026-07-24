export function buildMissingConversionSetupPath(missing, { pathname = '', search = '' } = {}) {
  const params = new URLSearchParams(search || '');
  const returnTo = `${pathname || ''}${search || ''}`;
  const productId = missing?.product_id || '';

  if (productId) params.set('conversionProductId', productId);
  if (missing?.product_name) params.set('conversionProductName', missing.product_name);
  if (missing?.to_unit) params.set('fromUnit', missing.to_unit);
  if (missing?.from_unit) params.set('toUnit', missing.from_unit);
  if (Number(missing?.quantity) > 0) params.set('quantity', String(missing.quantity));
  if (returnTo) params.set('returnTo', returnTo);

  return `/Recipes/setup?${params.toString()}`;
}

export function readMissingConversionSetupParams(search = '') {
  const params = new URLSearchParams(search || '');
  const productId = params.get('conversionProductId') || '';
  const fromUnit = params.get('fromUnit') || '';
  const toUnit = params.get('toUnit') || '';
  const quantity = Number(params.get('quantity') || 0);

  if (!fromUnit && !toUnit && !productId) {
    return { defaults: null, returnTo: params.get('returnTo') || '' };
  }

  return {
    defaults: {
      scope: productId ? 'product' : 'org',
      productId,
      fromUnit,
      toUnit,
      factor: '',
      focusFactor: true,
      sampleQuantity: quantity > 0 ? quantity : 2,
      prefillKey: `${productId}:${fromUnit}:${toUnit}:${quantity || ''}`,
    },
    returnTo: params.get('returnTo') || '',
  };
}
