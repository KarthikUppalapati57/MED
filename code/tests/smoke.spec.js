import { test, expect } from '@playwright/test';

test.describe('E2E Smoke Tests', () => {
  test('should load the login page and authenticate', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Check if we are on the login screen
    await expect(page.locator('text=Sign in to your account')).toBeVisible();

    // Fill out the login form
    // Note: Use the standard QA seed user
    await page.fill('input[type="email"]', 'qa_admin@example.com');
    await page.fill('input[type="password"]', 'qa_password123');
    await page.click('button:has-text("Sign in")');

    // Wait for the dashboard to load
    await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to the inventory page', async ({ page }) => {
    await page.goto('/');
    
    // We assume the user is already logged in due to session persistence or we need to login again
    // For this smoke test, we'll just check if the app framework is working
    await page.evaluate(() => window.localStorage.setItem('supabase.auth.token', 'mock_token'));
    
    // Test navigation
    await page.goto('/Inventory');
    await expect(page.locator('text=Inventory & Stocking')).toBeVisible({ timeout: 5000 });
  });
});
