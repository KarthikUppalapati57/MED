import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Products from '../../src/modules/products/pages/Products';
import { MemoryRouter } from 'react-router-dom';

const mutate = vi.fn();
const toastInfo = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: (...args) => toastInfo(...args),
  },
}));

vi.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    organization: { id: 'org-1' },
    brand: null,
    location: null,
  }),
}));

vi.mock('../../src/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isGroundStaff: false,
  }),
}));

vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: {
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../../src/lib/apiClient', () => ({
  api: {
    entities: {
      Product: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
    vendors: {
      getFlaggedVendorItems: vi.fn(),
      resolvePriceVariance: vi.fn(),
    },
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      cancelQueries: vi.fn(),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
    }),
    useMutation: () => ({
      mutate,
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

vi.mock('../../src/hooks/useAuthQuery', () => ({
  useAuthInfiniteQuery: () => ({
    data: {
      pages: [[
        {
          id: 'product-1',
          name: 'Ground Beef 80/20',
          product_id: 'PRD-1',
          category: 'Meat',
          accounting_category: '5110',
          is_inventoried: true,
          is_tax_exempt: false,
          report_by_unit: 'lb',
          base_unit: 'lb',
          latest_price: 4.25,
          created_at: new Date().toISOString(),
        },
        {
          id: 'product-2',
          name: 'Premium Wagyu Beef',
          product_id: 'PRD-2',
          category: 'Meat',
          accounting_category: '5110',
          is_inventoried: true,
          is_tax_exempt: false,
          report_by_unit: 'lb',
          base_unit: 'lb',
          latest_price: 28,
          created_at: new Date().toISOString(),
        },
      ]],
    },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useAuthQuery: ({ queryKey }) => {
    if (queryKey[0] === 'global_vendor_items') {
      return {
        data: [
          {
            id: 'trusted-1',
            item_name: 'Ground Beef 80/20',
            mapping_count: 412,
            most_common_category: 'food_cogs',
            confidence_score: 95,
          },
          {
            id: 'poisoned-1',
            item_name: 'Premium Wagyu Beef',
            mapping_count: 999,
            most_common_category: 'office_supplies',
            confidence_score: 99,
          },
        ],
      };
    }
    if (queryKey[0] === 'price_variances') {
      return { data: [], isLoading: false };
    }
    return { data: [], isLoading: false };
  },
}));

describe('Products global mapping smoke test', () => {
  it('shows only trusted network suggestions and opens review instead of one-click applying', () => {
    render(
      <MemoryRouter initialEntries={['/Products/ai-verification']}>
        <Products />
      </MemoryRouter>
    );

    expect(screen.getByText(/Trusted Network Match: 412\+ restaurants map this to 5100 - Food Cost/)).toBeInTheDocument();
    expect(screen.queryByText(/office_supplies/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Accept Network Mapping')).not.toBeInTheDocument();

    const reviewButton = screen.getByRole('button', { name: 'Review Network Mapping' });
    const beefRow = reviewButton.closest('tr');
    expect(within(beefRow).getByText('Ground Beef 80/20')).toBeInTheDocument();
    fireEvent.click(reviewButton);

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Edit Product')).toBeInTheDocument();
    expect(toastInfo).toHaveBeenCalledWith('Network suggestion loaded for review. Confirm the category before saving.');
  });
});
