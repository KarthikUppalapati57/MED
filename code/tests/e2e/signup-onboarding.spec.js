import { test, expect } from '@playwright/test';

const SUPABASE_URL_PATTERN = '**/*.supabase.co/**';
const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_TOKEN = 'INVITEFLOW123';
const TEST_EMAIL = 'invite-flow-test@example.com';

const json = (body, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockSignupOnboardingSupabase(page, { acceptInvitationFails = false, inviteLookupDelayMs = 0 } = {}) {
  await page.route(SUPABASE_URL_PATTERN, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname.endsWith('/rest/v1/rpc/get_invite_details')) {
      if (inviteLookupDelayMs) await new Promise((resolve) => setTimeout(resolve, inviteLookupDelayMs));
      return route.fulfill(json([{ id: 'invite-1', email: TEST_EMAIL, role: 'tenant_super_admin', expires_at: null, accepted_at: null }]));
    }

    if (pathname.endsWith('/rest/v1/rpc/log_invitation_opened')) {
      return route.fulfill(json(null));
    }

    if (pathname.endsWith('/rest/v1/rpc/is_username_available')) {
      return route.fulfill(json(true));
    }

    if (pathname.endsWith('/auth/v1/signup')) {
      return route.fulfill(json({
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        user: {
          id: TEST_USER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: TEST_EMAIL,
          app_metadata: { provider: 'email', providers: ['email'], role: 'tenant_super_admin' },
          user_metadata: { full_name: 'Invite Flow User', username: 'inviteflowuser', invite_token: TEST_TOKEN, role: 'tenant_super_admin' },
        },
      }));
    }

    if (pathname.endsWith('/auth/v1/logout')) {
      return route.fulfill(json({}));
    }
    if (pathname.endsWith('/auth/v1/token')) {
      return route.fulfill(json({
        access_token: 'test-access-token-refreshed',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token-refreshed',
        user: {
          id: TEST_USER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: TEST_EMAIL,
          app_metadata: { provider: 'email', providers: ['email'], role: 'tenant_super_admin' },
          user_metadata: { full_name: 'Invite Flow User', username: 'inviteflowuser', invite_token: TEST_TOKEN, role: 'tenant_super_admin' },
        },
      }));
    }

    if (pathname.endsWith('/rest/v1/rpc/accept_invitation')) {
      if (acceptInvitationFails) {
        return route.fulfill(json({ message: 'network unavailable' }, 503));
      }
      return route.fulfill(json({ success: true, role: 'tenant_super_admin', business_verification_required: true }));
    }

    if (pathname.endsWith('/rest/v1/profiles')) {
      return route.fulfill(json([{
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        full_name: 'Invite Flow User',
        role: 'tenant_super_admin',
        organization_id: null,
        brand_id: null,
        location_id: null,
        payment_verified: false,
        banking_onboarding_completed: false,
        business_verification_status: 'not_started',
        onboarding_status: 'not_started',
        onboarding_current_step: 'business_verification',
        organization: null,
        brand: null,
        location: null,
      }]));
    }

    return route.fulfill(json(null));
  });
}

test.describe('invited signup onboarding routing', () => {
  test('auto-confirmed invited signup accepts invite and routes to business verification', async ({ page }) => {
    await mockSignupOnboardingSupabase(page);

    await page.goto(`/signup/${TEST_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Create Your Account' })).toBeVisible();
    await expect(page.locator('#signup-email')).toHaveValue(TEST_EMAIL);

    await page.locator('#signup-full-name').fill('Invite Flow User');
    await page.locator('#signup-username').fill('inviteflowuser');
    await expect(page.getByText('Username is available.')).toBeVisible();
    await page.locator('#signup-password').fill('N9!KzT5@mR8#LpQ');
    await page.locator('#signup-confirm-password').fill('N9!KzT5@mR8#LpQ');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/business-verification$/, { timeout: 5000 });
  });

  test('invite lookup connection timeout shows retryable validation error', async ({ page }) => {
    await mockSignupOnboardingSupabase(page, { inviteLookupDelayMs: 17000 });

    await page.goto(`/signup/${TEST_TOKEN}`);
    await expect(page.getByText(/Invitation validation is taking too long|Invitation validation timed out/)).toBeVisible({ timeout: 18000 });
  });

  test('invitation acceptance connection failure keeps token and sends user to invite login retry', async ({ page }) => {
    await mockSignupOnboardingSupabase(page, { acceptInvitationFails: true });

    await page.goto(`/signup/${TEST_TOKEN}`);
    await page.locator('#signup-full-name').fill('Invite Flow User');
    await page.locator('#signup-username').fill('inviteflowuser');
    await expect(page.getByText('Username is available.')).toBeVisible();
    await page.locator('#signup-password').fill('N9!KzT5@mR8#LpQ');
    await page.locator('#signup-confirm-password').fill('N9!KzT5@mR8#LpQ');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(new RegExp(`/login\\?invite=${TEST_TOKEN}&email=${encodeURIComponent(TEST_EMAIL)}`), { timeout: 6000 });
  });
});


