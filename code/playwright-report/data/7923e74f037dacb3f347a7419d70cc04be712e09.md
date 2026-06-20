# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.js >> Authentication & Authorization Routing >> Unauthenticated user is redirected to login from protected route
- Location: tests\e2e\auth.spec.js:5:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /.*(\/login|^http:\/\/localhost:5173\/$)/
Received string:  "http://localhost:5173/PlatformOrganizations"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × unexpected value "http://localhost:5173/PlatformOrganizations"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Authentication & Authorization Routing', () => {
  4  | 
  5  |   test('Unauthenticated user is redirected to login from protected route', async ({ page }) => {
  6  |     page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  7  |     page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  8  | 
  9  |     // Attempt to access a protected route without logging in
  10 |     await page.goto('/PlatformOrganizations');
  11 | 
  12 |     // Wait for the URL to change to the landing page or login page
> 13 |     await expect(page).toHaveURL(/.*(\/login|^http:\/\/localhost:5173\/$)/);
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  14 |   });
  15 | 
  16 |   test('Unauthenticated user cannot access Dashboard', async ({ page }) => {
  17 |     await page.goto('/dashboard');
  18 | 
  19 |     // Dashboard should redirect unauthenticated users to the root landing page or login
  20 |     await expect(page).toHaveURL(/.*(\/login|^http:\/\/localhost:5173\/$)/);
  21 |   });
  22 | 
  23 | });
  24 | 
```