const ACTIVE_VALUES = new Set(['active', 'enabled', 'true', '1', 'yes']);
const PAUSED_VALUES = new Set(['paused', 'pause']);
const NONE_VALUES = new Set(['none', 'no alerts', 'not enabled', 'disabled', 'false', '0', 'no', '']);

const read = (row, names) => {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return '';
};

export function normalizeImportedAlertStatus(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (ACTIVE_VALUES.has(normalized)) return 'active';
  if (PAUSED_VALUES.has(normalized)) return 'paused';
  if (NONE_VALUES.has(normalized)) return 'none';
  return null;
}

export function analyzeMenuItemImportRows(rawRows, existingItems = [], supportsAlertLifecycle = false, locations = [], supportsVisibility = false) {
  const existingByName = new Map(existingItems.map((item) => [String(item.name || '').trim().toLowerCase(), item]));
  const locationByName = new Map(locations.map((location) => [String(location.name || '').trim().toLowerCase(), location]));
  const nameCounts = rawRows.reduce((counts, row) => {
    const name = String(read(row, ['Name', 'name'])).trim().toLowerCase();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map());

  return rawRows.map((row, index) => {
    const name = String(read(row, ['Name', 'name'])).trim();
    const normalizedName = name.toLowerCase();
    const category = String(read(row, ['Classification', 'classification', 'Type', 'type']) || 'main_course').trim().toLowerCase().replace(/\s+/g, '_');
    const status = String(read(row, ['Status', 'status']) || 'active').trim().toLowerCase();
    const rawPrice = read(row, ['Menu Price', 'menu_price', 'selling_price']);
    const sellingPrice = rawPrice === '' ? 0 : Number(rawPrice);
    const rawAlertStatus = read(row, ['Cost Monitoring', 'cost_monitoring', 'margin_alert_status', 'margin_alert_enabled']);
    const marginAlertStatus = normalizeImportedAlertStatus(rawAlertStatus);
    const rawVisibility = String(read(row, ['Visibility', 'visibility']) || 'All Locations').trim();
    const normalizedVisibility = rawVisibility.toLowerCase();
    const selectedLocationNames = normalizedVisibility.startsWith('selected:') ? rawVisibility.slice(rawVisibility.indexOf(':') + 1).split(';').map((name) => name.trim()).filter(Boolean) : [];
    const visibilityMode = ['all', 'all locations'].includes(normalizedVisibility) ? 'all' : normalizedVisibility === 'hidden' ? 'hidden' : normalizedVisibility.startsWith('selected:') ? 'selected' : null;
    const visibleLocationIds = selectedLocationNames.map((name) => locationByName.get(name.toLowerCase())?.id).filter(Boolean);
    const errors = [];

    if (!name) errors.push('Name is required');
    if (normalizedName && nameCounts.get(normalizedName) > 1) errors.push('Duplicate name in this file');
    if (!['active', 'inactive'].includes(status)) errors.push('Status must be active or inactive');
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) errors.push('Menu Price must be a non-negative number');
    if (!marginAlertStatus) errors.push('Cost Monitoring must be Active, Paused, or No Alerts');
    if (marginAlertStatus === 'paused' && !supportsAlertLifecycle) errors.push('Paused alerts require the database migration');
    if (!visibilityMode) errors.push('Visibility must be All Locations, Hidden, or Selected: Location A; Location B');
    if (!supportsVisibility && visibilityMode !== 'all') errors.push('Location visibility requires the database migration');
    if (visibilityMode === 'selected' && (!selectedLocationNames.length || visibleLocationIds.length !== selectedLocationNames.length)) errors.push('One or more selected locations were not found');

    const existing = existingByName.get(normalizedName);
    return {
      rowNumber: index + 2,
      name,
      category,
      status,
      selling_price: sellingPrice,
      margin_alert_status: marginAlertStatus || 'none',
      margin_alert_enabled: marginAlertStatus === 'active',
      visibility_mode: visibilityMode || 'all',
      visible_location_ids: visibleLocationIds,
      existingId: existing?.id || null,
      action: errors.length ? 'invalid' : existing ? 'update' : 'create',
      errors,
    };
  });
}
