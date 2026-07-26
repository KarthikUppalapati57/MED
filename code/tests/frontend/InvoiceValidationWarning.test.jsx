import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ValidationDialog from '../../src/modules/invoices/components/ValidationDialog';

vi.mock('../../src/hooks/useConfirmation', () => ({
  useConfirmation: () => ({
    confirm: vi.fn(async () => true),
  }),
}));

vi.mock('../../src/modules/invoices/lib/invoiceValidation', () => ({
  VALIDATION_CHECK_LABELS: {
    duplicate_check: 'Duplicate Check',
    invoice_math: 'Line Item Math',
  },
  runInvoiceValidationChecks: vi.fn(async () => ({
    duplicate_check: {
      status: 'fail',
      message: 'Invoice #1001 from Test Vendor already exists.',
    },
    invoice_math: {
      status: 'pass',
      message: '',
    },
  })),
  summarizeValidationIssues: (results) => Object.values(results)
    .filter((result) => result.status !== 'pass' && result.message)
    .map((result) => `${result.status === 'fail' ? 'Error:' : 'Warning:'} ${result.message}`),
}));

describe('ValidationDialog invoice warning approval flow', () => {
  it('warns on failed checks, requires notes, and then allows approval', async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ValidationDialog
        open
        onOpenChange={onOpenChange}
        invoice={{
          id: 'invoice-1',
          invoice_number: '1001',
          vendor_name: 'Test Vendor',
          total_amount: 125,
          validation_results: {},
        }}
        onSave={onSave}
      />
    );

    expect(await screen.findByText('Critical issues were found during validation.')).toBeInTheDocument();
    expect(screen.getByText('Invoice #1001 from Test Vendor already exists.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Approval' }));

    expect(screen.getByText(/approve anyway/i)).toBeInTheDocument();
    const approveButton = screen.getByRole('button', { name: 'Approve Invoice' });
    expect(approveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Approval/Rejection Notes'), {
      target: { value: 'Manager reviewed duplicate warning and approves.' },
    });
    expect(approveButton).not.toBeDisabled();

    fireEvent.click(approveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_approval',
      validation_notes: 'Manager reviewed duplicate warning and approves.',
      validation_results: expect.objectContaining({
        duplicate_check: expect.objectContaining({ status: 'fail' }),
      }),
    }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});