import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Invoices from '../../src/pages/Invoices';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
    userProfile: { role: 'manager' },
  }),
}));

// Mock react-query
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
    useMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

// Mock the custom hooks
vi.mock('../../src/hooks/useAuthQuery', () => ({
  useAuthQuery: ({ queryKey }) => {
    if (queryKey[0] === 'vendors') {
      return { data: [], isLoading: false };
    }
    if (queryKey[0] === 'invoices') {
      return { 
        data: [{ id: '1', vendor_name: 'Sysco', invoice_number: 'INV-001', total_amount: 500, status: 'pending_review' }], 
        isLoading: false 
      };
    }
    return { data: [], isLoading: false };
  },
}));

describe('Invoices Functional Testing', () => {
  it('renders the invoices page and lists invoices', async () => {
    render(
      <BrowserRouter>
        <Invoices />
      </BrowserRouter>
    );

    // Should display the page title
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    
    // Should display the mocked invoice data
    expect(screen.getByText('Sysco')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
  });
});
