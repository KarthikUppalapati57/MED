import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/lib/apiClient';
import { runInvoiceValidationChecks } from '../../src/modules/invoices/lib/invoiceValidation';

vi.mock('../../src/lib/apiClient', () => ({
  api: {
    entities: {
      Invoice: { filter: vi.fn() },
      InvoiceLineItem: { filter: vi.fn() },
      Vendor: { get: vi.fn() },
      ReconciliationVariance: { filter: vi.fn() },
    },
  },
}));

describe('invoice validation checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.entities.Invoice.filter.mockResolvedValue([]);
    api.entities.InvoiceLineItem.filter.mockResolvedValue([]);
    api.entities.ReconciliationVariance.filter.mockResolvedValue([]);
  });

  it('validates line-item math from invoice JSON when normalized line rows are missing', async () => {
    const invoice = {
      id: 'invoice-234883',
      invoice_number: '234883',
      vendor_name: 'US Foods, Inc.',
      vendor_id: null,
      organization_id: 'org-1',
      brand_id: 'brand-1',
      location_id: 'location-1',
      subtotal: 67.58,
      tax_amount: 2.42,
      fuel_surcharge: 0,
      delivery_fee: 0,
      other_charges: 0,
      total_amount: 70,
      line_items: [
        { quantity: 1, unit_price: 48.91, extended_price: 48.91 },
        { quantity: 1, unit_price: 18.67, extended_price: 18.67 },
      ],
    };

    const results = await runInvoiceValidationChecks(invoice);

    expect(results.invoice_math).toEqual({ status: 'pass', message: '' });
    expect(results.delivery_match).toEqual({ status: 'pass', message: '' });
    expect(api.entities.InvoiceLineItem.filter).toHaveBeenCalledWith({
      invoice_id: 'invoice-234883',
      organization_id: 'org-1',
    });
    expect(api.entities.ReconciliationVariance.filter).toHaveBeenCalledWith({
      invoice_id: 'invoice-234883',
      is_resolved: false,
      organization_id: 'org-1',
    });
  });

  it('explains duplicated extracted lines that likely came from a hazard summary section', async () => {
    const invoice = {
      id: 'invoice-234883',
      invoice_number: '234883',
      vendor_name: 'US Foods, Inc.',
      vendor_id: null,
      organization_id: 'org-1',
      brand_id: 'brand-1',
      location_id: 'location-1',
      subtotal: 67.58,
      tax_amount: 0,
      fuel_surcharge: 0,
      delivery_fee: 0,
      other_charges: 0,
      total_amount: 67.58,
      line_items: [
        { vendor_item_code: '7945058', description: 'DEGREASER, AP VP3 LIQ JUG BLU', quantity: 1, unit_price: 48.91, extended_price: 48.91 },
        { vendor_item_code: '820704', description: 'SEASONING SALT, NO MSG ADDED', quantity: 1, unit_price: 18.67, extended_price: 18.67 },
        { vendor_item_code: '7945058', description: 'DEGREASER, AP VP3 LIQ JUG BLU', quantity: 1, unit_price: 48.91, extended_price: 48.91 },
      ],
    };

    const results = await runInvoiceValidationChecks(invoice);

    expect(results.invoice_math.status).toBe('fail');
    expect(results.invoice_math.message).toContain('subtotal: expected $116.49, got $67.58');
    expect(results.invoice_math.message).toContain('Possible duplicate extracted line: DEGREASER, AP VP3 LIQ JUG BLU ($48.91).');
    expect(results.invoice_math.message).toContain('Hazard Materials Summary');
    expect(results.invoice_math.message).toContain('remove/review the duplicate before approval');
  });
});