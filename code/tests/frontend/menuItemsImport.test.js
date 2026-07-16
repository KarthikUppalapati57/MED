import { describe, expect, it } from 'vitest';
import { analyzeMenuItemImportRows, normalizeImportedAlertStatus } from '../../src/modules/recipes/lib/menuItemsImport';

describe('Menu Items CSV import', () => {
  it('normalizes supported monitoring values', () => {
    expect(normalizeImportedAlertStatus('Enabled')).toBe('active');
    expect(normalizeImportedAlertStatus('Paused')).toBe('paused');
    expect(normalizeImportedAlertStatus('No Alerts')).toBe('none');
    expect(normalizeImportedAlertStatus('unexpected')).toBeNull();
  });

  it('classifies new and existing items', () => {
    const rows = analyzeMenuItemImportRows([
      { Name: 'Burger', 'Menu Price': '12', 'Cost Monitoring': 'Active' },
      { Name: 'Salad', 'Menu Price': '8', 'Cost Monitoring': 'No Alerts' },
    ], [{ id: 'recipe-1', name: 'Burger' }], true);
    expect(rows.map((row) => row.action)).toEqual(['update', 'create']);
  });

  it('rejects duplicate names, invalid prices, and unsupported paused alerts', () => {
    const rows = analyzeMenuItemImportRows([
      { Name: 'Burger', 'Menu Price': '-1', 'Cost Monitoring': 'Paused' },
      { Name: 'burger', 'Menu Price': '12', 'Cost Monitoring': 'Active' },
    ], [], false);
    expect(rows.every((row) => row.action === 'invalid')).toBe(true);
    expect(rows[0].errors).toContain('Duplicate name in this file');
    expect(rows[0].errors).toContain('Menu Price must be a non-negative number');
    expect(rows[0].errors).toContain('Paused alerts require the database migration');
  });

  it('resolves selected visibility location names', () => {
    const rows = analyzeMenuItemImportRows([{ Name: 'Burger', Visibility: 'Selected: Downtown; Airport', 'Cost Monitoring': 'Active' }], [], true, [{ id: '1', name: 'Downtown' }, { id: '2', name: 'Airport' }], true);
    expect(rows[0].visibility_mode).toBe('selected');
    expect(rows[0].visible_location_ids).toEqual(['1', '2']);
    expect(rows[0].action).toBe('create');
  });
});
