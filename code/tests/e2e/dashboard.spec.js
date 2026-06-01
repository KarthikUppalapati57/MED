import { test, expect } from '@playwright/test';

test.describe('Dashboard Workflows (Section 5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Dashboard');
  });

  test('Dashboard prevents unauthenticated data loading', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const isLogin = await page.locator('text=Welcome to EdgeOps').count() > 0;
    const isUnauthorized = await page.locator('text=Unauthorized').count() > 0;
    
    expect(isLogin || isUnauthorized).toBeTruthy();
    
    // Ensure no sensitive data elements load
    const revenueCard = page.locator('text=Total Revenue');
    await expect(revenueCard).toHaveCount(0);
  });
});
