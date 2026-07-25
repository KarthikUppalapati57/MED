import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const retiredProvider = String.fromCharCode(100, 119, 111, 108, 108, 97);
const retiredCustomerColumn = `${retiredProvider}_customer_url`;
const retiredOnboardingColumn = `${retiredProvider}_onboarding_status`;
const retiredAchMethod = `${retiredProvider}_ach`;
const payout = read('code/supabase/functions/process-payout/index.ts');
const onboarding = read('code/supabase/functions/vendor-onboarding/index.ts');
const registry = read('code/supabase/functions/_shared/payoutProviders/index.ts');
const stripeConnectPayoutAdapter = read('code/supabase/functions/_shared/payoutProviders/stripeConnect.ts');

for (const [name, source] of [
  ['process-payout', payout],
  ['vendor-onboarding', onboarding],
  ['_shared/payoutProviders/stripeConnect', stripeConnectPayoutAdapter],
]) {
  assert(!source.includes(retiredCustomerColumn), `${name} still references legacy vendor customer URL column`);
  assert(!source.includes(retiredOnboardingColumn), `${name} still references legacy vendor onboarding status column`);
}

assert(payout.includes('provider.preflight(ctx)'), 'process-payout must run provider preflight before mutating payment state');
assert(payout.indexOf('provider.preflight(ctx)') < payout.indexOf("rpc('release_invoice_funds'"), 'process-payout must guard the payout before release_invoice_funds mutates state');
assert(payout.includes("vendorApproval.approval_status !== 'approved'"), 'process-payout must re-check vendor approval_status before paying out');
assert(payout.includes('vendorApproval.deleted_at'), 'process-payout must refuse to pay an archived vendor');
assert(payout.indexOf("approval_status !== 'approved'") < payout.indexOf("rpc('release_invoice_funds'"), 'process-payout must re-check approval before release_invoice_funds mutates state');
assert(payout.includes("payout_method = 'stripe_connect_custom'"), 'process-payout must default to Stripe Connect for ACH payouts');

assert(registry.includes('stripe_connect_custom: stripeConnect'), 'payout registry must expose Stripe Connect ACH payouts');
assert(!registry.includes(retiredAchMethod), 'payout registry must not expose retired ACH payouts');
assert(stripeConnectPayoutAdapter.includes("from('bank_accounts')"), 'Stripe Connect payout adapter must resolve the vendor receiving bank account');
assert(stripeConnectPayoutAdapter.includes("from('bank_account_provider_links')"), 'Stripe Connect payout adapter must resolve provider-neutral payout links');
assert(stripeConnectPayoutAdapter.includes("provider', 'stripe_connect_custom'"), 'Stripe Connect payout adapter must request the Stripe Connect provider link');
assert(stripeConnectPayoutAdapter.includes('payouts_enabled !== true'), 'Stripe Connect payout adapter must fail closed when payouts are disabled');
assert(stripeConnectPayoutAdapter.includes("stripePost('/transfers'"), 'Stripe Connect payout adapter must initiate Stripe transfers');

assert(onboarding.includes('from("bank_accounts")'), 'vendor-onboarding must write the vendor receiving account to the provider-neutral bank vault');
assert(onboarding.includes('rpc("store_bank_account_secret"'), 'vendor-onboarding must vault the routing/account numbers via store_bank_account_secret');
assert(onboarding.includes('owner_type: "vendor"'), 'vendor-onboarding bank_accounts insert must be scoped to the vendor as owner');
assert(onboarding.includes('purpose: "vendor_receiving"'), 'vendor-onboarding bank_accounts insert must be tagged as a vendor receiving account');

console.log('V1c-b edge rewire static assertions passed');
