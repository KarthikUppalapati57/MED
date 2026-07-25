import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes = [
  '/', '/login', '/signup',
  '/terms', '/privacy', '/cookies', '/acceptable-use', '/security', '/dpa', '/sla',
  '/vendor-terms', '/ai-terms', '/open-source', '/ccpa-privacy-rights', '/msa', '/accessibility',
];

for (const route of publicRoutes) {
  test(`public route has no critical accessibility violations: ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalViolations = results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact)
    );

    expect(criticalViolations).toEqual([]);
  });
}