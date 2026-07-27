import { WIDGET_STATES } from '@/modules/performance/components/shared/WidgetState';

export function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCategoryLabel(value) {
  const label = String(value || '').trim();
  return label || null;
}

export function normalizedCategoryKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function findDuplicateLookingCategories(categories = []) {
  const groups = new Map();
  for (const category of categories) {
    const label = normalizeCategoryLabel(category);
    if (!label) continue;
    const key = normalizedCategoryKey(label);
    const values = groups.get(key) || new Set();
    values.add(label);
    groups.set(key, values);
  }
  return [...groups.values()]
    .filter((values) => values.size > 1)
    .map((values) => [...values].sort());
}

export function buildExactBudgetComparison({
  spendRows = [],
  budgetTargets = [],
  missingSpendIsZero = false,
} = {}) {
  const targetsByCategory = new Map();
  for (const target of budgetTargets) {
    const category = normalizeCategoryLabel(target.category);
    if (!category) continue;
    const rows = targetsByCategory.get(category) || [];
    rows.push(target);
    targetsByCategory.set(category, rows);
  }

  const spendByCategory = new Map();
  for (const row of spendRows) {
    const category = normalizeCategoryLabel(row.category);
    if (!category) continue;
    spendByCategory.set(category, row);
  }

  const categories = new Set([...spendByCategory.keys(), ...targetsByCategory.keys()]);
  const rows = [...categories].map((category) => {
    const spendRow = spendByCategory.get(category);
    const targets = targetsByCategory.get(category) || [];
    const actual = spendRow
      ? finiteOrNull(spendRow.currentSpend)
      : missingSpendIsZero ? 0 : null;
    const duplicateTargets = targets.length > 1;
    const target = targets.length === 1 ? targets[0] : null;
    const budget = finiteOrNull(target?.target_amount);
    const hasBudget = targets.length > 0;
    const mappingAvailable = !duplicateTargets && actual !== null;
    const variance = mappingAvailable && budget !== null ? actual - budget : null;
    const percentageVariance =
      variance !== null && budget !== null && budget !== 0
        ? (variance / Math.abs(budget)) * 100
        : null;
    const status = duplicateTargets
      ? 'mapping_unavailable'
      : !hasBudget
        ? 'no_budget'
        : actual === null
          ? 'mapping_unavailable'
          : variance > 0
            ? 'over'
            : variance < 0
              ? 'under'
              : 'on';
    return {
      category,
      actual,
      budget,
      variance,
      percentageVariance,
      hasBudget,
      duplicateTargets,
      mappingAvailable,
      status,
      targetId: target?.id || null,
    };
  });

  rows.sort((a, b) => {
    if (a.status === 'mapping_unavailable' && b.status !== 'mapping_unavailable') return -1;
    if (b.status === 'mapping_unavailable' && a.status !== 'mapping_unavailable') return 1;
    if (a.hasBudget !== b.hasBudget) return a.hasBudget ? -1 : 1;
    return Math.abs(b.variance || 0) - Math.abs(a.variance || 0);
  });

  const trustworthyRows = rows.filter((row) => row.mappingAvailable && row.hasBudget);
  return {
    rows,
    chartRows: trustworthyRows.slice(0, 8),
    noBudgetRows: rows.filter((row) => !row.hasBudget),
    duplicateTargetRows: rows.filter((row) => row.duplicateTargets),
    overBudgetCount: trustworthyRows.filter((row) => row.status === 'over').length,
    configuredBudgetCount: rows.filter((row) => row.hasBudget).length,
    trustworthyBudgetCount: trustworthyRows.length,
    state:
      rows.length === 0
        ? WIDGET_STATES.EMPTY
        : trustworthyRows.length === 0
          ? WIDGET_STATES.UNAVAILABLE
          : trustworthyRows.length < rows.filter((row) => row.hasBudget).length
            ? WIDGET_STATES.PARTIAL
            : WIDGET_STATES.READY,
  };
}

export function calculateRecipeMarginCoverage(recipes = []) {
  const rows = recipes.map((recipe) => {
    const cost = finiteOrNull(recipe.cost_per_serving ?? recipe.total_cost ?? recipe.recipe_cost ?? recipe.food_cost);
    const price = finiteOrNull(recipe.selling_price ?? recipe.suggested_price ?? recipe.menu_price ?? recipe.price);
    const targetMargin = finiteOrNull(recipe.target_margin_percent ?? recipe.target_margin);
    const calculable = cost !== null && cost > 0 && price !== null && price > 0;
    const margin = calculable ? ((price - cost) / price) * 100 : null;
    const risk = calculable && (
      targetMargin !== null && targetMargin > 0
        ? margin < targetMargin
        : margin < 30
    );
    return { ...recipe, cost, price, targetMargin, margin, calculable, risk };
  });
  const calculableRows = rows.filter((row) => row.calculable);
  const riskRows = calculableRows.filter((row) => row.risk);
  return {
    rows,
    calculableRows,
    riskRows,
    totalCount: rows.length,
    calculableCount: calculableRows.length,
    riskCount: riskRows.length,
    state:
      rows.length === 0
        ? WIDGET_STATES.EMPTY
        : calculableRows.length === 0
          ? WIDGET_STATES.UNAVAILABLE
          : calculableRows.length < rows.length
            ? WIDGET_STATES.PARTIAL
            : WIDGET_STATES.READY,
  };
}

export function calculateProductCategoryCoverage(products = []) {
  const totalCount = products.length;
  const categorizedCount = products.filter((product) =>
    normalizeCategoryLabel(product.category || product.accounting_category)
  ).length;
  return {
    totalCount,
    categorizedCount,
    percentage: totalCount ? (categorizedCount / totalCount) * 100 : null,
    state:
      totalCount === 0
        ? WIDGET_STATES.EMPTY
        : categorizedCount === 0
          ? WIDGET_STATES.UNAVAILABLE
          : categorizedCount < totalCount
            ? WIDGET_STATES.PARTIAL
            : WIDGET_STATES.READY,
  };
}

export function calculateInventoryCoverage(inventory = []) {
  const rows = inventory.map((row) => {
    const value = finiteOrNull(row.current_value);
    const quantity = finiteOrNull(row.current_quantity);
    const reorderPoint = finiteOrNull(row.reorder_point ?? row.par_level);
    return {
      ...row,
      value,
      quantity,
      reorderPoint,
      lowStock:
        quantity !== null &&
        reorderPoint !== null &&
        reorderPoint > 0 &&
        quantity <= reorderPoint,
    };
  });
  const valuedRows = rows.filter((row) => row.value !== null);
  const reorderRows = rows.filter((row) => row.quantity !== null && row.reorderPoint !== null && row.reorderPoint > 0);
  return {
    totalCount: rows.length,
    valuedCount: valuedRows.length,
    inventoryValue: valuedRows.length
      ? valuedRows.reduce((total, row) => total + row.value, 0)
      : null,
    reorderEvaluableCount: reorderRows.length,
    lowStockCount: reorderRows.filter((row) => row.lowStock).length,
    valueState:
      rows.length === 0
        ? WIDGET_STATES.EMPTY
        : valuedRows.length === 0
          ? WIDGET_STATES.UNAVAILABLE
          : valuedRows.length < rows.length
            ? WIDGET_STATES.PARTIAL
            : WIDGET_STATES.READY,
    reorderState:
      rows.length === 0
        ? WIDGET_STATES.EMPTY
        : reorderRows.length === 0
          ? WIDGET_STATES.UNAVAILABLE
          : reorderRows.length < rows.length
            ? WIDGET_STATES.PARTIAL
            : WIDGET_STATES.READY,
  };
}

export function calculatePaymentStatusAmounts(payments = [], invoices = []) {
  const paymentStatuses = ['scheduled', 'processing', 'failed', 'cancelled', 'refunded'];
  const invoiceStatuses = ['unpaid', 'partial'];
  const paymentAmounts = Object.fromEntries(paymentStatuses.map((status) => [status, 0]));
  const paymentCounts = Object.fromEntries(paymentStatuses.map((status) => [status, 0]));
  const invoiceAmounts = Object.fromEntries(invoiceStatuses.map((status) => [status, 0]));
  const invoiceCounts = Object.fromEntries(invoiceStatuses.map((status) => [status, 0]));

  for (const payment of payments) {
    const status = String(payment.status || '').toLowerCase();
    const amount = finiteOrNull(payment.amount);
    if (status in paymentAmounts && amount !== null) {
      paymentAmounts[status] += amount;
      paymentCounts[status] += 1;
    }
  }
  for (const invoice of invoices) {
    const status = String(invoice.payment_status || '').toLowerCase();
    const amount = finiteOrNull(invoice.total_amount);
    if (status in invoiceAmounts && amount !== null) {
      invoiceAmounts[status] += amount;
      invoiceCounts[status] += 1;
    }
  }

  return {
    paymentAmounts,
    paymentCounts,
    invoiceAmounts,
    invoiceCounts,
    hasPaymentData: Object.values(paymentCounts).some((count) => count > 0),
    hasInvoiceData: Object.values(invoiceCounts).some((count) => count > 0),
    combinedExposure: null,
    reconciliationAvailable: false,
  };
}

export function applyPerformanceDrilldown({
  filters,
  onOpenTab,
  tab,
  category = null,
  view = null,
}) {
  if (category) filters?.setCategoryIds?.([category]);
  if (view) onOpenTab?.(tab, { view });
  else onOpenTab?.(tab);
}

export function getBudgetRowActionState({
  rowCategory,
  duplicateTargets = false,
  savePending = false,
  saveCategory = null,
  clearPending = false,
  clearCategory = null,
}) {
  return {
    disabled: duplicateTargets || savePending || clearPending,
    saving: savePending && saveCategory === rowCategory,
    clearing: clearPending && clearCategory === rowCategory,
  };
}
