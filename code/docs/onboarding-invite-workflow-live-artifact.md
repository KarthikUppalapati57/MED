# RestOps Invite Signup and Onboarding Workflow Artifact

Generated: 2026-07-29

## Purpose

This artifact documents the invited-user signup workflow and the checks run after fixing the issue where newly created invited users could land on the public landing page instead of the onboarding flow.

## Root Cause Found

The signup page previously did this after successful account creation:

```js
const destination = data?.session ? '/' : '/login';
setTimeout(() => navigate(destination), 3000);
```

For auto-confirmed Supabase projects, `data.session` exists, so new invited users were sent to `/`. If auth/profile/invite acceptance had not completed cleanly yet, `/` could render the public landing page or pass through the wrong auth gate.

Existing-account invite login was more reliable because it explicitly accepted the invitation and navigated to `/business-verification`.

## Fixed Behavior

After signup succeeds, the app now:

1. Stores the invite token as pending recovery state.
2. If Supabase returned a session, sets the session explicitly.
3. Calls `accept_invitation` immediately with the invite token.
4. Clears the pending invite token only after successful acceptance.
5. Refreshes the Supabase session so JWT/profile metadata can sync.
6. Routes directly to:
   - `/business-verification` when business verification is required.
   - `/onboarding` when business verification is skipped for that invite.
7. If invitation acceptance fails after account creation, signs the user out and sends them to `/login?invite=<token>&email=<email>` so the existing invite retry path can accept it safely.

## End-to-End Workflow

```mermaid
flowchart TD
  A[Admin generates invite link] --> B[User opens /signup/:token]
  B --> C[Validate invite with get_invite_details]
  C -->|valid| D[Signup form unlocked]
  C -->|timeout/error| E[Show retry/reissue invite error]
  D --> F[Validate full name, locked email, username, password]
  F -->|valid| G[Supabase auth.signUp]
  G -->|existing account| H[Store pending token and send to invite-aware login]
  G -->|email confirmation required| I[Store pending token and send to invite-aware login]
  G -->|auto-confirmed session| J[Set session]
  J --> K[Call accept_invitation]
  K -->|success, verification required| L[/business-verification]
  K -->|success, verification skipped| M[/onboarding]
  K -->|connection/error| N[Sign out, keep pending token]
  N --> H
  L --> O[Business verification submit/review]
  O -->|verified| M
  M --> P[Hierarchy/modules/plan onboarding]
  P --> Q[Payment/subscription step if required]
  Q --> R[/complete-onboarding for operating bank setup]
  R --> S[Dashboard]
```

## Automated Click-Level Tests Added

File: `tests/e2e/signup-onboarding.spec.js`

Covered scenarios:

1. Auto-confirmed invited signup
   - Opens `/signup/:token`.
   - Loads invite details.
   - Fills full name, username, password, confirmation.
   - Clicks `Create Account`.
   - Mocks Supabase session creation.
   - Mocks `accept_invitation` success.
   - Verifies final URL is `/business-verification`.

2. Invite lookup connection issue
   - Delays invite lookup beyond validation timeout.
   - Verifies retry/reissue validation error appears.

3. Invite acceptance connection issue after account creation
   - Signup succeeds with a session.
   - `accept_invitation` fails.
   - Verifies user is routed to `/login?invite=<token>&email=<email>` so the invite can be safely retried.

## Verification Commands Run

```bash
npx playwright test tests/e2e/signup-onboarding.spec.js --project=chromium
npm run build
```

Results:

- Playwright focused onboarding suite: 3 passed.
- Production build: passed.

## Manual Live Checklist For Deployed Environments

Run this once each PR is merged and Vercel finishes deployment.

### Prod

- Domain: `https://www.restops-360.com`
- Supabase: `mousarlsxzphqmvilepv`
- Required env: `VITE_APP_URL=https://www.restops-360.com`

Checks:

1. Generate invite from Platform Admin.
2. Confirm email/link starts with `https://www.restops-360.com/signup/`.
3. Open link in incognito.
4. Fill form with a compliant password, no personal/email words.
5. Click `Create Account`.
6. Expected: user lands on `/business-verification` or `/onboarding`, not landing page.
7. Refresh page.
8. Expected: user stays in onboarding gate.

### QA

- Domain: `https://qa.restops-360.com`
- Branch: `release`
- Supabase: `gsupqfmwlsmwoybphimx`
- Required env: `VITE_APP_URL=https://qa.restops-360.com`

Same checks as Prod.

### R&D

- Domain: `https://rnd.restops-360.com`
- Branch: `feature`
- Supabase: `vkfrsoakhssvvavmjeoy`
- Required env: `VITE_APP_URL=https://rnd.restops-360.com`

Same checks as Prod.

## Connection Issue Expectations

- Invite validation slow/down: user should see an invitation validation timeout/reissue message.
- Signup succeeds but invite acceptance fails: user is signed out and redirected to invite-aware login with token/email preserved.
- Existing account: user is sent to login with invite token; after login, `accept_invitation` runs and routes to `/business-verification`.
- Auth confirmation required: pending invite token is preserved and accepted after login.

## Files Changed

- `src/App.jsx`
- `tests/e2e/signup-onboarding.spec.js`

Previous canonical URL fix files still apply:

- `src/lib/appUrl.js`
- `src/modules/platform/pages/PlatformAdmin.jsx`
- `src/modules/platform/pages/PlatformUserManagement.jsx`
- `src/modules/admin/pages/UserManagement.jsx`
