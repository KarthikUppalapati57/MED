/**
 * Localhost Category Report UI verification (mocked data, no network writes).
 * Run: npx vitest run tests/frontend/categoryReportUiVerification.test.jsx
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const emptyReport = {
  summary: {
    totalSpend: 0,
    previousSpend: 0,
    absoluteChange: 0,
    percentageChange: 0,
    largestCategory: null,
    fastestGrowingCategory: null,
    activeCategoryCount: 0,
    topThreeConcentrationPercentage: 0,
    averageInvoiceValue: 0,
    categoriesOverBudget: null,
    invoiceCount: 0,
    uncategorizedSpend: 0,
  },
  categoryBreakdown: [],
  trend: [],
  distribution: [],
  pareto: [],
  vendorContribution: [],
  tableRows: [],
  insights: [],
  metadata: {
    currency: 'USD',
    timezone: 'UTC',
    dataFreshness: '2026-07-21 00:00',
    hasBudgetData: false,
    granularity: 'day',
    filterOptions: { categories: [], vendors: [] },
    selectedCategory: null,
  },
};

const populatedReport = {
  ...emptyReport,
  summary: {
    ...emptyReport.summary,
    totalSpend: 1000,
    previousSpend: 800,
    absoluteChange: 200,
    percentageChange: 25,
    largestCategory: { category: 'Produce', spend: 600, percentageOfTotal: 60 },
    fastestGrowingCategory: {
      category: 'Dairy',
      currentSpend: 300,
      previousSpend: 100,
      percentageChange: 200,
      absoluteChange: 200,
    },
    activeCategoryCount: 2,
    topThreeConcentrationPercentage: 100,
    averageInvoiceValue: 500,
    invoiceCount: 2,
    uncategorizedSpend: 0,
  },
  categoryBreakdown: [
    { category: 'Produce', currentSpend: 600, previousSpend: 500, percentageVariance: 20, percentageOfTotal: 60 },
    { category: 'Dairy', currentSpend: 400, previousSpend: 300, percentageVariance: 33.3, percentageOfTotal: 40 },
  ],
  tableRows: [
    {
      category: 'Produce',
      currentSpend: 600,
      previousSpend: 500,
      absoluteVariance: 100,
      percentageVariance: 20,
      percentageOfTotal: 60,
      invoiceCount: 1,
      vendorCount: 1,
      averageInvoiceValue: 600,
      largestVendor: 'Vendor A',
      trendStatus: 'up',
    },
  ],
  distribution: [{ category: 'Produce', spend: 600, isOther: false, percentageOfTotal: 60 }],
  pareto: [{ category: 'Produce', spend: 600, rank: 1, sharePercentage: 60, cumulativePercentage: 60 }],
  vendorContribution: [{ category: 'Produce', vendor: 'Vendor A', spend: 600, sharePercentage: 100, invoiceCount: 1 }],
  trend: [{ bucket: '2026-07-01', bucketStart: '2026-07-01', category: 'Produce', spend: 600 }],
  insights: [{ id: 'i1', text: 'Produce spend increased 20.0% compared with the previous period.', impact: 100 }],
  metadata: {
    ...emptyReport.metadata,
    hasBudgetData: false,
    selectedCategory: 'Produce',
    filterOptions: { categories: ['Produce', 'Dairy'], vendors: [{ id: 'v1', name: 'Vendor A' }] },
  },
};

const hooks = vi.hoisted(() => ({
  useCategoryPerformance: vi.fn(),
  useCategoryPerformanceDrilldown: vi.fn(),
  useAuth: vi.fn(),
  useAuthQueries: vi.fn(),
}));

vi.mock('@/modules/performance/hooks/useCategoryPerformance', () => ({
  useCategoryPerformance: hooks.useCategoryPerformance,
  useCategoryPerformanceDrilldown: hooks.useCategoryPerformanceDrilldown,
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: hooks.useAuth,
}));

vi.mock('@/hooks/useAuthQuery', () => ({
  useAuthQueries: hooks.useAuthQueries,
}));

vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }) => React.createElement('div', { 'data-testid': 'chart-stub' }, children);
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: () => null,
    LineChart: Stub,
    Line: () => null,
    PieChart: Stub,
    Pie: Stub,
    Cell: () => null,
    ComposedChart: Stub,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ReferenceLine: () => null,
  };
});

import CategoryReportPage from '@/modules/performance/tabs/CategoryReport/CategoryReportPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <CategoryReportPage />
    </MemoryRouter>
  );
}

describe('Category Report UI verification', () => {
  beforeEach(() => {
    hooks.useAuth.mockReturnValue({
      organization: { id: 'org-1', name: 'Test Org' },
      location: { id: 'loc-1', name: 'Main' },
    });
    hooks.useAuthQueries.mockReturnValue([
      { data: [{ id: 'loc-1', name: 'Main' }], isLoading: false },
    ]);
    hooks.useCategoryPerformanceDrilldown.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders empty-state experience without fake performance zeros in chart area', () => {
    hooks.useCategoryPerformance.mockReturnValue({
      report: emptyReport,
      summary: emptyReport.summary,
      categoryBreakdown: [],
      trend: [],
      distribution: [],
      pareto: [],
      vendorContribution: [],
      tableRows: [],
      insights: [],
      metadata: emptyReport.metadata,
      isLoading: false,
      isError: false,
      error: null,
      isEmpty: true,
      refetch: vi.fn(),
      isFetching: false,
    });

    renderPage();

    expect(screen.getByText('Category Report')).toBeInTheDocument();
    expect(screen.getByText('Total Purchasing Spend')).toBeInTheDocument();
    expect(screen.getByText('No purchasing data was found for the selected filters.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /clear filters/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /view invoices/i })).toBeInTheDocument();
    expect(screen.queryByText('Purchasing Spend by Category')).not.toBeInTheDocument();
    expect(screen.getByText('Budget mapping unavailable')).toBeInTheDocument();
    // KPI empty cards use "No data" rather than fabricated chart series
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
    expect(screen.queryByText(/% of COGS/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Prime cost')).not.toBeInTheDocument();
  });

  it('renders KPIs, charts, table, insights, and opens drill-down on row click', () => {
    hooks.useCategoryPerformance.mockReturnValue({
      report: populatedReport,
      summary: populatedReport.summary,
      categoryBreakdown: populatedReport.categoryBreakdown,
      trend: populatedReport.trend,
      distribution: populatedReport.distribution,
      pareto: populatedReport.pareto,
      vendorContribution: populatedReport.vendorContribution,
      tableRows: populatedReport.tableRows,
      insights: populatedReport.insights,
      metadata: populatedReport.metadata,
      isLoading: false,
      isError: false,
      error: null,
      isEmpty: false,
      refetch: vi.fn(),
      isFetching: false,
    });

    hooks.useCategoryPerformanceDrilldown.mockReturnValue({
      data: {
        category: 'Produce',
        summary: {
          totalSpend: 600,
          absoluteChange: 100,
          percentageChange: 20,
          invoiceCount: 1,
          vendorCount: 1,
          averageInvoiceValue: 600,
        },
        vendors: [{ vendor: 'Vendor A', spend: 600, sharePercentage: 100, invoiceCount: 1, averageInvoice: 600, absoluteChange: 50 }],
        products: [{ product: 'Lettuce', quantityPurchased: 10, currentUnitPrice: 2, averageUnitPrice: 2, totalSpend: 20, vendor: 'Vendor A' }],
        invoices: [{ invoiceId: 'inv-1', invoiceNumber: 'INV-1', date: '2026-07-01', vendor: 'Vendor A', amount: 600, status: 'approved', location: 'Main' }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Total Purchasing Spend')).toBeInTheDocument();
    expect(screen.getByText('Period Change')).toBeInTheDocument();
    expect(screen.getByText('Largest Spend Category')).toBeInTheDocument();
    expect(screen.getByText('Fastest-Growing Category')).toBeInTheDocument();
    expect(screen.getByText('Active Categories')).toBeInTheDocument();
    expect(screen.getByText('Top-Three Concentration')).toBeInTheDocument();
    expect(screen.getByText('Average Invoice Value')).toBeInTheDocument();
    expect(screen.getByText('Categories Over Budget')).toBeInTheDocument();

    expect(screen.getByText('Purchasing Spend by Category')).toBeInTheDocument();
    expect(screen.getByText('Category Spend Trend')).toBeInTheDocument();
    expect(screen.getByText('Category Distribution')).toBeInTheDocument();
    expect(screen.getByText('Pareto Analysis')).toBeInTheDocument();
    expect(screen.getByText('Vendor Contribution by Category')).toBeInTheDocument();
    expect(screen.getByText('Category Detail')).toBeInTheDocument();
    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText(/Produce spend increased/)).toBeInTheDocument();

    const produceCells = screen.getAllByText('Produce');
    const tableCell = produceCells.find((el) => el.closest('tr') && el.className.includes('font-medium'));
    fireEvent.click(tableCell || produceCells[produceCells.length - 1]);
    expect(screen.getByText('Purchasing spend drill-down')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vendors' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invoices' })).toBeInTheDocument();
  });

  it('shows error retry UI when report fails', () => {
    hooks.useCategoryPerformance.mockReturnValue({
      report: null,
      summary: null,
      categoryBreakdown: [],
      trend: [],
      distribution: [],
      pareto: [],
      vendorContribution: [],
      tableRows: [],
      insights: [],
      metadata: null,
      isLoading: false,
      isError: true,
      error: { message: 'RPC failed' },
      isEmpty: false,
      refetch: vi.fn(),
      isFetching: false,
    });

    renderPage();
    expect(screen.getByText('RPC failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('exposes filter labels for date, location, category, vendor, and clear', () => {
    hooks.useCategoryPerformance.mockReturnValue({
      report: emptyReport,
      summary: emptyReport.summary,
      categoryBreakdown: [],
      trend: [],
      distribution: [],
      pareto: [],
      vendorContribution: [],
      tableRows: [],
      insights: [],
      metadata: emptyReport.metadata,
      isLoading: false,
      isError: false,
      error: null,
      isEmpty: true,
      refetch: vi.fn(),
      isFetching: false,
    });

    renderPage();
    expect(screen.getByText('Date from')).toBeInTheDocument();
    expect(screen.getByText('Date to')).toBeInTheDocument();
    expect(screen.getByText('Compare from')).toBeInTheDocument();
    expect(screen.getByText('Compare to')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /clear filters/i }).length).toBeGreaterThan(0);
  });
});
