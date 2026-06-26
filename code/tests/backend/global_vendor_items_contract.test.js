import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Global vendor item recommendation hardening contract', () => {
  it('keeps tenant clients on trusted global mapping suggestions only', () => {
    const productsSource = read('src/pages/Products.jsx');

    expect(productsSource).toContain(".rpc('get_trusted_global_vendor_item_suggestions')");
    expect(productsSource).not.toContain(".from('global_vendor_items')");
    expect(productsSource).toContain('function isTrustedGlobalMapping');
    expect(productsSource).toContain('function findTrustedGlobalMatch');
    expect(productsSource).toContain('MIN_NETWORK_MAPPING_COUNT = 50');
    expect(productsSource).toContain('MIN_NETWORK_CONFIDENCE = 90');
  });

  it('does not allow one-click application of crowdsourced mappings', () => {
    const productsSource = read('src/pages/Products.jsx');

    expect(productsSource).toContain('Review Network Mapping');
    expect(productsSource).not.toContain('Accept Network Mapping');
    expect(productsSource).not.toMatch(/accounting_category:\s*globalMatch\.most_common_category/);
    expect(productsSource).toContain('Network suggestion loaded for review');
  });

  it('locks down raw global vendor mappings and exposes a filtered RPC', () => {
    const migration = read('supabase/migrations/20260625000028_global_vendor_item_trust_hardening.sql');

    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.global_vendor_items FROM anon, authenticated');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_trusted_global_vendor_item_suggestions');
    expect(migration).toContain('gvi.mapping_count >= 50');
    expect(migration).toContain('gvi.confidence_score >= 90');
    expect(migration).toContain('public.normalize_global_vendor_category(gvi.most_common_category) IS NOT NULL');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_trusted_global_vendor_item_suggestions() TO authenticated, service_role');
  });
});
