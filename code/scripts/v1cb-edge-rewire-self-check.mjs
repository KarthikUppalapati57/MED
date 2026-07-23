import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve repo-root-relative paths from this file's own location so the check runs the same
// whether invoked as `node code/scripts/...` from the repo root or as `npm run check:edge-rewire`
// from inside code/ (npm's cwd is the package.json dir, not the repo root).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const payout = read('code/supabase/functions/process-payout/index.ts');
const onboarding = read('code/supabase/functions/vendor-onboarding/index.ts');
const webhook = read('code/supabase/functions/payout-webhook/index.ts');
const fundingSource = read('code/supabase/functions/create-dwolla-funding-source/index.ts');
const dwollaPayoutAdapter = read('code/supabase/functions/_shared/payoutProviders/dwolla.ts');

for (const [name, source] of [
  ['process-payout', payout],
  ['vendor-onboarding', onboarding],
  ['payout-webhook', webhook],
  ['_shared/payoutProviders/dwolla', dwollaPayoutAdapter],
]) {
  assert(!source.includes('dwolla_customer_url'), `${name} still references vendors.dwolla_customer_url`);
  assert(!source.includes('dwolla_onboarding_status'), `${name} still references vendors.dwolla_onboarding_status`);
}

// create-dwolla-funding-source legitimately keeps organizations.dwolla_customer_url (the org/source
// side, added by 20260716000001_payment_workflow_hardening.sql) -- only the vendor/destination
// branch must avoid the columns dropped from `vendors` by 20260628000027.
assert(!fundingSource.includes('dwolla_onboarding_status'), 'create-dwolla-funding-source still references vendors.dwolla_onboarding_status');
assert(!fundingSource.includes('vendor.dwolla_customer_url'), 'create-dwolla-funding-source vendor branch still reads vendors.dwolla_customer_url');
assert(!fundingSource.includes("'vendors').update({ dwolla_customer_url"), 'create-dwolla-funding-source vendor branch still writes vendors.dwolla_customer_url');

// process-payout/index.ts is a thin dispatcher (see its own top-of-file comment) -- the
// Dwolla-specific preflight/destination-resolution logic lives in the adapter it calls into.
assert(payout.includes('provider.preflight(ctx)'), 'process-payout must run the provider adapter preflight before mutating payment state');
assert(payout.indexOf('provider.preflight(ctx)') < payout.indexOf("rpc('release_invoice_funds'"), 'process-payout must guard the payout before release_invoice_funds mutates state');

assert(dwollaPayoutAdapter.includes("rpc('get_vendor_provider_link'"), 'dwolla payout adapter must resolve the vendor link through get_vendor_provider_link');
assert(dwollaPayoutAdapter.includes("p_provider: 'dwolla'"), 'dwolla payout adapter must request the Dwolla provider link');
assert(dwollaPayoutAdapter.includes('!dwollaLink?.provider_funding_ref'), 'dwolla payout adapter must fail closed when the vendor funding source is missing');
// Dwolla's transfers API requires both _links.source and _links.destination to be funding-source
// refs, not customer refs -- provider_customer_ref alone cannot receive a transfer.
assert(dwollaPayoutAdapter.includes('destinationUrl: dwollaLink.provider_funding_ref'), 'dwolla payout adapter destination must come from provider_funding_ref, not provider_customer_ref');
assert(dwollaPayoutAdapter.includes('sourceUrl: paymentAccount.dwolla_funding_source_url'), 'dwolla payout adapter source funding ref must remain on payment_accounts');
assert(!/destinationUrl:\s*paymentAccount\.dwolla_funding_source_url/.test(dwollaPayoutAdapter), 'dwolla payout adapter must not use the source ref as the destination');

assert(onboarding.includes('from("vendor_payment_provider_links")'), 'vendor-onboarding must write provider-link status');
assert(onboarding.includes("provider_status: \"unverified\""), 'vendor-onboarding must set unverified on provider-link creation (matches create-dwolla-funding-source and the VO-ST-012 state model)');
assert(onboarding.includes("provider: \"dwolla\""), 'vendor-onboarding must target the Dwolla provider link');
assert(!onboarding.includes('organization_id:') && !onboarding.includes('brand_id:') && !onboarding.includes('location_id:'), 'vendor-onboarding insert must not client-supply derived scope columns (set_vendor_sensitive_scope trigger owns them)');

assert(webhook.includes("from('vendor_payment_provider_links')"), 'payout-webhook must update provider-links');
assert(webhook.includes("eq('provider_customer_ref', resourceUrl)"), 'payout-webhook must match by provider_customer_ref');
assert(webhook.includes("eq('provider', 'dwolla')"), 'payout-webhook must scope lookup to Dwolla provider');
assert(!webhook.includes("eq('is_active'"), 'payout-webhook must not filter by is_active');

assert(fundingSource.includes("rpc('get_vendor_provider_link'"), 'create-dwolla-funding-source must resolve the existing vendor customer ref through get_vendor_provider_link');
assert(fundingSource.includes("p_provider: 'dwolla'"), 'create-dwolla-funding-source must request the Dwolla provider link');
assert(fundingSource.includes("from('vendor_payment_provider_links')"), 'create-dwolla-funding-source must write the vendor result to provider-links');
assert(!fundingSource.includes('organization_id: vendor.organization_id'), 'create-dwolla-funding-source vendor upsert must not client-supply derived scope columns (set_vendor_sensitive_scope trigger owns them)');

console.log('V1c-b edge rewire static assertions passed');