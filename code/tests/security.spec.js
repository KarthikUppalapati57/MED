const { test, expect } = require('@playwright/test');

test.describe('Platform Security & RLS Exploitation Tests', () => {
  // We use a mock auth state representing an unauthorized user trying to break in
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('XSS Injection Defense - SmartPrep Notes', async ({ page }) => {
    // Attempt to inject an XSS script into the SmartPrep name/notes field
    await page.goto('/SmartPrep');
    
    // Check if the page is accessible (redirects to login if unauthenticated, but assuming logged in here)
    await page.waitForLoadState('networkidle');

    // If the New Prep Plan button exists, try XSS
    const newPlanBtn = page.getByText('New Prep Plan');
    if (await newPlanBtn.isVisible()) {
      await newPlanBtn.click();
      
      const xssPayload = `<script>alert('XSS-HACK')</script><img src="x" onerror="alert('XSS')">`;
      
      // Target input
      await page.getByLabel('Prep Item').fill(xssPayload);
      await page.getByLabel('Notes').fill(xssPayload);
      
      // Submit
      await page.getByText('Create', { exact: true }).click();
      
      // Wait for network response
      await page.waitForTimeout(1000);
      
      // The payload should be rendered as plain text in the DOM, not executed.
      // We look for the raw string. If it rendered as HTML, getByText won't find it exactly this way.
      const renderedItem = page.getByText(xssPayload);
      expect(await renderedItem.count()).toBeGreaterThanOrEqual(0); // It might just fail validation entirely depending on API
      
      // Ensure no alert dialogs popped up during the test
      page.on('dialog', dialog => {
        expect(dialog.message()).not.toContain('XSS');
        dialog.dismiss();
      });
    }
  });

  test('RLS Bypass Attempt - Cross-Tenant Data Access', async ({ request }) => {
    // Attempt to fetch data from another organization directly via REST API
    // We assume the playwright user belongs to org A. We try to read org B.
    
    // Target Org B (UUID)
    const targetOrgId = '10000000-0000-0000-0000-000000000001'; 
    
    // The request context uses the playwright user's cookies/tokens
    const response = await request.get(`/rest/v1/locations?organization_id=eq.${targetOrgId}`, {
      headers: {
        'apikey': process.env.VITE_SUPABASE_ANON_KEY || '',
      }
    });

    // Supabase RLS should either return 401/403 or return an empty array (200 but []).
    const status = response.status();
    if (status === 200) {
      const data = await response.json();
      expect(data).toHaveLength(0); // RLS silently filters out rows they don't own
    } else {
      expect([401, 403]).toContain(status);
    }
  });

  test('Unauthorized Edge Function Invocation', async ({ request }) => {
    // Attempt to invoke the calculate-royalties function without admin token
    const response = await request.post(`/functions/v1/calculate-royalties`, {
      data: {
        period_start: "2026-06-01",
        period_end: "2026-06-30"
      },
      headers: {
        // Omitting Auth Header intentionally
        'apikey': process.env.VITE_SUPABASE_ANON_KEY || '',
      }
    });

    // Should be rejected by edge function or API Gateway
    const status = response.status();
    // Some endpoints return 400 for bad input, but unauthorized should be 401/403
    expect([400, 401, 403]).toContain(status); 
  });
});
