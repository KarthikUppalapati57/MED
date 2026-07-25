# Stripe Setup

This app already has the Stripe client packages and Supabase Edge Functions needed for onboarding subscriptions and billing portal access. Use this checklist to connect a Stripe account safely.

## Local and Staging

Use Stripe test/sandbox keys while testing.

Required variables:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

`VITE_STRIPE_PUBLISHABLE_KEY` is browser-safe. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must stay server-side in Supabase/Vercel/environment secrets.

## Stripe Dashboard

1. Open Stripe Dashboard in test mode.
2. Go to Developers or Workbench, then API keys.
3. Copy the publishable key into `VITE_STRIPE_PUBLISHABLE_KEY`.
4. Reveal/copy the secret key into `STRIPE_SECRET_KEY`.
5. Create a webhook endpoint with this URL:

```text
https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1/stripe-webhook
```

Subscribe the endpoint to:

```text
checkout.session.completed
invoice.payment_succeeded
account.updated
```

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

## Supabase

Set the server-side secrets in the linked Supabase project:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Deploy the Stripe-related Edge Functions:

```bash
npm run deploy:edge-functions -- create-checkout-session create-portal-session create-payment-intent stripe-webhook
```

Run the readiness check:

```bash
npm run check:staging-sandbox
```

## Production

Before going live:

1. Rotate any keys that were exposed in local files, screenshots, logs, or chat.
2. Replace test keys with live keys: `pk_live_...`, `sk_live_...`, and the live webhook `whsec_...`.
3. Add a live webhook endpoint for the production app URL.
4. Verify products/plans in the `plans` table have valid Stripe price IDs, or let `create-checkout-session` create missing monthly prices.
5. Run a real low-dollar checkout only after Supabase secrets, webhooks, and production domain redirects are in place.
## Production Release Gate

The production release check intentionally requires live Stripe keys and a real HTTPS app URL:

```bash
APP_ENV=production
APP_BASE_URL=https://your-production-domain.com
VITE_APP_BASE_URL=https://your-production-domain.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Then run:

```bash
npm run check:release-env
```

Expected result for a production-ready environment: `ok: true`. If local `.env` still contains `pk_test_` or `sk_test_`, the release check should fail. That failure is deliberate.

Production webhook endpoint:

```text
https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1/stripe-webhook
```

Production webhook events:

```text
checkout.session.completed
invoice.payment_succeeded
account.updated
```

Production deploy order:

```bash
supabase secrets set APP_ENV=production
supabase secrets set APP_BASE_URL=https://your-production-domain.com
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npm run deploy:edge-functions -- create-checkout-session create-portal-session create-payment-intent stripe-webhook create-stripe-invoice
npm run check:release-env
npm run build
```

Keep `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` out of client-side hosting variables unless the host marks them server-only.
## Stripe Connect

This repo has provider-neutral payment routing with these Stripe adapters:

```text
collection_provider = stripe_ach_debit
payout_provider = stripe_connect_custom
```

The same `STRIPE_SECRET_KEY=sk_live_...` is used for Connect API calls. Enable Connect in Stripe before using live connected accounts:

1. In Stripe Dashboard, go to **Connect**.
2. Complete the **platform profile** and business details Stripe asks for.
3. In Connect settings, confirm your platform can create connected accounts in the United States.
4. Use **Custom** connected accounts only if RestOps is ready to collect and maintain the required account-holder information. Stripe recommends hosted or embedded onboarding when possible because requirements change over time.
5. Add `account.updated` to the production webhook events so connected-account verification and payout status are synced back to the app.

Production webhook events for this app should include:

```text
checkout.session.completed
invoice.payment_succeeded
account.updated
```

Optional environment flag for release reports:

```bash
STRIPE_CONNECT_ENABLED=true
```

Current app behavior:

- Linking a `vendor_receiving` bank account creates a Stripe Custom connected account with the `transfers` capability requested.
- Stripe verification status is synced from `account.updated` webhooks into `bank_account_provider_links`.
- Actual Connect transfer creation is still deferred until the connected account is verified and the ACH debit/mandate flow has been tested end to end.
