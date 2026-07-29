param(
  [string]$ProjectRef = ""
)

if ($ProjectRef) {
  supabase link --project-ref $ProjectRef
}
supabase functions deploy ai-insights-chat
supabase functions deploy api-gateway
supabase functions deploy billing-worker
supabase functions deploy calculate-depletion
supabase functions deploy calculate-royalties
supabase functions deploy categorize-products
supabase functions deploy checkbook-webhook
supabase functions deploy create-api-key
supabase functions deploy create-checkout-session
supabase functions deploy create-payment-intent
supabase functions deploy create-portal-session
supabase functions deploy create-stripe-invoice
supabase functions deploy create-webhook-endpoint
supabase functions deploy dashboard-report-scheduler
supabase functions deploy evaluate-vendor-bids
supabase functions deploy forecast-labor
supabase functions deploy generate-prep-sheet
supabase functions deploy invite-user
supabase functions deploy invoice-processing
supabase functions deploy iot-ingest
supabase functions deploy iot-webhook
supabase functions deploy notify-channel-dispatch
supabase functions deploy notify-demo-request
supabase functions deploy onboarding-contact-otp
supabase functions deploy onboarding-expiry-monitor
supabase functions deploy password-reset-email
supabase functions deploy payment-bank-accounts
supabase functions deploy pg-backup
supabase functions deploy pos-sync
supabase functions deploy pos-webhook
supabase functions deploy process-email-invoices
supabase functions deploy process-marketing
supabase functions deploy process-onboarding
supabase functions deploy process-payout
supabase functions deploy provider-neutral-payment-router
supabase functions deploy schedule-reports
supabase functions deploy send-due-date-reminder-emails
supabase functions deploy send-transactional-email
supabase functions deploy smartprep-cron
supabase functions deploy stripe-webhook
supabase functions deploy submit-client-feedback
supabase functions deploy sync-accounting
supabase functions deploy sync-delivery-menus
supabase functions deploy team-worker
supabase functions deploy vendor-onboarding
supabase functions deploy voice-copilot-parser
supabase functions deploy webhook-dispatcher
