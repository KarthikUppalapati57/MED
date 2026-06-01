import { test, expect } from '@playwright/test';

test.describe('Invoices Workflow (Section 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Invoices');
  });

  test('UI enforces authentication before accessing Invoices', async ({ page }) => {
    // Wait for network idle
    await page.waitForLoadState('networkidle');

    // Without a valid admin token, the app should bounce us to the login page.
    const isLogin = await page.locator('text=Welcome to EdgeOps').count() > 0;
    const isUnauthorized = await page.locator('text=Unauthorized').count() > 0;
    
    expect(isLogin || isUnauthorized).toBeTruthy();
  });
});
