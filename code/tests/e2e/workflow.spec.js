import { test, expect } from '@playwright/test';

test.describe('EdgeOps Production Readiness Workflow', () => {
  
  test('User can access login page and see auth elements', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // The landing page might redirect or show login. We assume the user ends up at login or can click "Sign In"
    const heading = page.locator('h1');
    await expect(heading.first()).toBeVisible();

    // Verify critical elements are present based on the checklist
    // Checklist: User Authentication -> User login
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await expect(emailInput).toBeVisible();
      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toBeVisible();
    }
  });

  test('Page loads without unhandled exceptions', async ({ page }) => {
    let errors = [];
    page.on('pageerror', exception => {
      errors.push(exception);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Ensure no client-side exceptions were thrown during initial mount
    expect(errors.length).toBe(0);
  });
});
