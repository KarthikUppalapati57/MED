import { test, expect } from '@playwright/test';

test.describe('Authentication & Authorization Routing', () => {

  test('Unauthenticated user is redirected to login from protected route', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

    // Attempt to access a protected route without logging in
    await page.goto('/PlatformOrganizations');

    // Wait for the URL to change to the landing page or login page
    await expect(page).toHaveURL(/.*(\/login|^http:\/\/localhost:5173\/$)/);
  });

  test('Unauthenticated user cannot access Dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Dashboard should redirect unauthenticated users to the root landing page or login
    await expect(page).toHaveURL(/.*(\/login|^http:\/\/localhost:5173\/$)/);
  });

});
