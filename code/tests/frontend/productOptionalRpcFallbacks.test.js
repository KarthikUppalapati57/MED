import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    from: vi.fn(),
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));

describe('Products optional RPC fallbacks', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.resetModules();
  });

  it('getApprovalSetting returns false when RPC is missing from schema cache', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_product_approval_setting(p_organization_id) in the schema cache',
      },
    });

    const { api } = await import('../../src/lib/apiClient');
    await expect(api.products.getApprovalSetting('org-1')).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith('get_product_approval_setting', {
      p_organization_id: 'org-1',
    });
  });

  it('getDashboardSummary returns null when RPC is missing', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_product_dashboard_summary(...) in the schema cache',
      },
    });

    const { api } = await import('../../src/lib/apiClient');
    await expect(api.products.getDashboardSummary({ organizationId: 'org-1' })).resolves.toBeNull();
  });

  it('getCatalog still throws on genuine catalog failures', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for function get_product_catalog',
      },
    });

    const { api } = await import('../../src/lib/apiClient');
    await expect(api.products.getCatalog({ organizationId: 'org-1' })).rejects.toMatchObject({
      code: '42501',
    });
  });
});
