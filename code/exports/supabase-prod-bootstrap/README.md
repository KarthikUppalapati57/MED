# Supabase Production Bootstrap Handoff

Generated for the currently linked Supabase project:

- Project ref: `gsupqfmwlsmwoybphimx`
- Local Supabase project: `code/supabase`
- Current migration count: 570 SQL files
- Current Edge Function count: 47 deployable function folders

## What Is Already In This Repo

Use these files/folders as the source of truth before copying anything from the Supabase dashboard:

- Full migration history: `code/supabase/migrations/*.sql`
- Seed/reference starter data: `code/supabase/seed.sql`
- Edge Functions: `code/supabase/functions/*`
- Function config/JWT settings: `code/supabase/config.toml`
- Existing RLS/RBAC aggregate file: `code/aggregated_rls_rbac.sql`
- Pending migration aggregate: `code/pending_migrations.sql`

## Live Dump Status

I attempted to run:

```powershell
supabase db dump --linked --schema public,storage,extensions,auth,cron,realtime,net,vault --file exports\supabase-prod-bootstrap\001_live_schema_policies_grants.sql
```

The Supabase CLI connected far enough to start the remote dump flow, but this machine does not currently have Docker Desktop running/available. Supabase CLI uses a Dockerized `pg_dump` image for `supabase db dump`, so the dump could not complete.

After Docker Desktop is running, rerun the command above from:

```powershell
C:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\code
```

Also export roles:

```powershell
supabase db dump --linked --role-only --file exports\supabase-prod-bootstrap\002_live_roles.sql
```

Do not create a data-only dump unless you intentionally want to move business/user data into production.

## Recommended Production Setup

1. Create the new Supabase production project.
2. In the new repo/project, update `supabase/config.toml` to the new production project ref.
3. Link the CLI to prod:

```powershell
supabase link --project-ref <new-prod-project-ref>
```

4. Apply migrations:

```powershell
supabase db push
```

5. If you need to bootstrap from the live dump instead of migration history, run `001_live_schema_policies_grants.sql` in the new project first, then inspect/apply `002_live_roles.sql` carefully.
6. Add secrets with `supabase secrets set`, or add them manually in the Supabase dashboard.
7. Deploy Edge Functions.
8. Verify RLS, Auth, Storage, cron jobs, Realtime, and app env vars before switching users.

## Edge Functions To Deploy

Deploy all functions from `code/supabase/functions`:

```powershell
$functions = @(
  'ai-insights-chat',
  'api-gateway',
  'billing-worker',
  'calculate-depletion',
  'calculate-royalties',
  'categorize-products',
  'checkbook-webhook',
  'create-api-key',
  'create-checkout-session',
  'create-payment-intent',
  'create-portal-session',
  'create-stripe-invoice',
  'create-webhook-endpoint',
  'dashboard-report-scheduler',
  'evaluate-vendor-bids',
  'forecast-labor',
  'generate-prep-sheet',
  'invite-user',
  'invoice-processing',
  'iot-ingest',
  'iot-webhook',
  'notify-channel-dispatch',
  'notify-demo-request',
  'onboarding-contact-otp',
  'onboarding-expiry-monitor',
  'password-reset-email',
  'payment-bank-accounts',
  'pg-backup',
  'pos-sync',
  'pos-webhook',
  'process-email-invoices',
  'process-marketing',
  'process-onboarding',
  'process-payout',
  'provider-neutral-payment-router',
  'schedule-reports',
  'send-due-date-reminder-emails',
  'send-transactional-email',
  'smartprep-cron',
  'stripe-webhook',
  'submit-client-feedback',
  'sync-accounting',
  'sync-delivery-menus',
  'team-worker',
  'vendor-onboarding',
  'voice-copilot-parser',
  'webhook-dispatcher'
)

foreach ($function in $functions) {
  supabase functions deploy $function
}
```

## Secret Names To Recreate

The repo references these Supabase/environment secret names. Values are intentionally not copied here.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_FUNCTIONS_URL`
- `GLOBAL_DATABASE_API_KEY`
- `GLOBAL_DATABASE_API_URL`

Also check each Edge Function for provider-specific secrets before production deploy, especially Stripe, email, OCR/AI, accounting, payment, webhook, and backup functions.

## Production Verification Checklist

- `supabase db push` finishes without errors on the new prod project.
- `supabase db lint` has no critical security issues.
- RLS is enabled on tenant/business tables.
- Storage buckets exist and have policies.
- Edge Functions deploy successfully.
- Required function secrets exist in prod.
- Cron jobs are scheduled in prod.
- Realtime is enabled only where needed.
- App frontend points to prod `VITE_SUPABASE_URL` and prod anon key.
- Service-role keys are never exposed to frontend code.
- Smoke test: signup/login, invite flow, invoice upload, vendor workflow, dashboard reports, payment/webhook flows, and admin-only flows.
