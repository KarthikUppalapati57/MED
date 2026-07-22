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

for (const [name, source] of [
  ['process-payout', payout],
  ['vendor-onboarding', onboarding],
  ['payout-webhook', webhook],
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

assert(payout.includes("rpc('get_vendor_provider_link'"), 'process-payout must resolve Dwolla vendor link through get_vendor_provider_link');
assert(payout.includes("p_provider: 'dwolla'"), 'process-payout must request the Dwolla provider link');
assert(payout.includes('!dwollaLink?.provider_customer_ref'), 'process-payout must fail closed when destination provider ref is missing');
assert(payout.indexOf('!dwollaLink?.provider_customer_ref') < payout.indexOf("rpc('release_invoice_funds'"), 'process-payout must guard destination before release_invoice_funds mutates state');
assert(payout.includes("destination: { href: dwollaLink.provider_customer_ref }"), 'process-payout destination must come from provider_customer_ref');
assert(payout.includes('source: { href: paymentAccount.dwolla_funding_source_url }'), 'process-payout source funding ref must remain on payment_accounts');
assert(!/destination:\s*\{\s*href:\s*(invoice\.payment_account|paymentAccount)\.dwolla_funding_source_url/.test(payout), 'process-payout must not use the source ref as the destination');

assert(onboarding.includes("from('vendor_payment_provider_links')"), 'vendor-onboarding must write provider-link status');
assert(onboarding.includes("provider_status: 'document_required'"), 'vendor-onboarding must set document_required on provider-link');
assert(onboarding.includes("provider: 'dwolla'"), 'vendor-onboarding must target the Dwolla provider link');
assert(!onboarding.includes('organization_id:') && !onboarding.includes('brand_id:') && !onboarding.includes('location_id:'), 'vendor-onboarding insert must not client-supply derived scope columns');

assert(webhook.includes("from('vendor_payment_provider_links')"), 'payout-webhook must update provider-links');
assert(webhook.includes("eq('provider_customer_ref', resourceUrl)"), 'payout-webhook must match by provider_customer_ref');
assert(webhook.includes("eq('provider', 'dwolla')"), 'payout-webhook must scope lookup to Dwolla provider');
assert(!webhook.includes("eq('is_active'"), 'payout-webhook must not filter by is_active');

assert(fundingSource.includes("rpc('get_vendor_provider_link'"), 'create-dwolla-funding-source must resolve the existing vendor customer ref through get_vendor_provider_link');
assert(fundingSource.includes("p_provider: 'dwolla'"), 'create-dwolla-funding-source must request the Dwolla provider link');
assert(fundingSource.includes("from('vendor_payment_provider_links')"), 'create-dwolla-funding-source must write the vendor result to provider-links');

console.log('V1c-b edge rewire static assertions passed');