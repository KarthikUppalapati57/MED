/**
 * Performance analytics service helpers (CSV export, formatting).
 */

export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function formatCount(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export function exportRowsToCsv(rows, columns, filename = 'category-report.csv') {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = columns.map((c) => escape(c.header)).join(',');
  const body = (rows || [])
    .map((row) => columns.map((c) => escape(typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor])).join(','))
    .join('\n');

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const CATEGORY_TABLE_EXPORT_COLUMNS = [
  { header: 'Category', accessor: 'category' },
  { header: 'Current Spend', accessor: 'currentSpend' },
  { header: 'Comparison Spend', accessor: 'previousSpend' },
  { header: 'Absolute Variance', accessor: 'absoluteVariance' },
  { header: 'Percentage Variance', accessor: 'percentageVariance' },
  { header: '% of Total', accessor: 'percentageOfTotal' },
  { header: 'Invoice Count', accessor: 'invoiceCount' },
  { header: 'Vendor Count', accessor: 'vendorCount' },
  { header: 'Average Invoice Value', accessor: 'averageInvoiceValue' },
  { header: 'Largest Vendor', accessor: 'largestVendor' },
];
