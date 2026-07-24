import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('HCI accessibility regressions', () => {
  it('keeps auth forms explicitly associated with visible labels', () => {
    const app = source('src/App.jsx');
    [
      'signup-full-name',
      'signup-email',
      'signup-username',
      'signup-password',
      'signup-confirm-password',
      'login-identifier',
      'login-password',
      'current-password',
      'new-password',
      'confirm-new-password',
      'password-reset-mfa-code',
    ].forEach((id) => {
      expect(app).toContain(`htmlFor="${id}"`);
      expect(app).toContain(`id="${id}"`);
    });
  });

  it('does not use native browser confirms in modernized high-risk workflows', () => {
    [
      'src/modules/invoices/components/InvoiceUploader.jsx',
      'src/modules/invoices/components/MobileReceiptCapture.jsx',
      'src/modules/admin/components/CustomRolesTab.jsx',
      'src/modules/admin/pages/OrgManagement.jsx',
      'src/modules/admin/pages/UserManagement.jsx',
      'src/modules/platform/pages/PlatformUsers.jsx',
      'src/modules/platform/pages/PlatformUserManagement.jsx',
      'src/modules/inventory/pages/Inventory.jsx',
    ].forEach((path) => {
      expect(source(path)).not.toMatch(/window\.confirm/);
    });
  });

  it('exposes analytics grid search and sort state to assistive technology', () => {
    const grid = source('src/modules/performance/components/shared/AnalyticsDataGrid.jsx');
    expect(grid).toContain('aria-sort={getSortState(col)}');
    expect(grid).toContain('aria-label={`Sort by ${col.header}, currently ${getSortState(col)}`}');
    expect(grid).toContain('htmlFor={searchInputId}');
    expect(grid).toContain('type="search"');
  });
});


