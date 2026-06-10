export function filterByContext(data, { organization, brand, location }) {
  if (!data || !Array.isArray(data)) return data;

  return data.filter(item => {
    // 1. If Location is selected
    if (location?.id) {
      // Direct match
      if (item.location_id === location.id) return true;
      // Inherited from Brand (has brand_id but no specific location)
      if (!item.location_id && item.brand_id && item.brand_id === location.brand_id) return true;
      // Inherited from Organization (has org_id but no specific brand/location)
      if (!item.location_id && !item.brand_id && item.organization_id === organization?.id) return true;
      // Also, if the table doesn't even have location/brand columns, we assume it's org-wide
      if (item.location_id === undefined && item.brand_id === undefined && item.organization_id === organization?.id) return true;
      return false;
    }

    // 2. If Brand is selected (but no location)
    if (brand?.id) {
      // Match anything under this brand (including all its locations)
      if (item.brand_id === brand.id) return true;
      // Inherited from Organization
      if (!item.brand_id && item.organization_id === organization?.id) return true;
      // If table lacks brand column but has org
      if (item.brand_id === undefined && item.organization_id === organization?.id) return true;
      return false;
    }

    // 3. If Organization is selected (All Brands / All Locations)
    if (organization?.id) {
      return item.organization_id === organization.id;
    }

    return true;
  });
}
