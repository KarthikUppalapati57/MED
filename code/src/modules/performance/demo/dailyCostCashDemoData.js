/**
 * Development-only Daily Cost & Cash demo dataset.
 * Purchasing/payables cash view — not full P&L or POS. Never written to the database.
 */

const CATEGORIES = [
  'Produce',
  'Meat',
  'Seafood',
  'Dairy',
  'Beverage',
  'Dry Goods',
  'Packaging',
];

const LOCATIONS = [
  { id: 'demo-loc-1', name: 'Downtown' },
  { id: 'demo-loc-2', name: 'Airport' },
  { id: 'demo-loc-3', name: 'Midtown' },
];

const MODULES = ['Invoice', 'Inventory', 'Payments'];

function createRng(seed = 59) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}

function dateStr(day) {
  return `2026-07-${String(day).padStart(2, '0')}`;
}

function buildDailyRows(rng) {
  const rows = [];
  let runningBalance = 12400;

  for (let day = 1; day <= 20; day++) {
    const isWeekend = day % 7 === 0 || day % 7 === 6;
    const purchases = round(isWeekend ? 800 + rng() * 1200 : 2200 + rng() * 4800);
    const payments = round(isWeekend ? rng() * 400 : 1800 + rng() * 5200);
    const net = round(purchases - payments);
    runningBalance = round(runningBalance + net);

    rows.push({
      id: `demo-daily-${day}`,
      date: dateStr(day),
      dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(day + 6) % 7],
      purchases,
      payments,
      net,
      runningBalance,
      invoiceCount: Math.floor(2 + rng() * 8),
      paymentCount: Math.floor(rng() * 5),
    });
  }

  return rows;
}

export function getDailyCostCashDemoData(params = {}) {
  const rng = createRng(101);
  const dailyRows = buildDailyRows(rng);

  const periodPurchases = round(dailyRows.reduce((s, r) => s + r.purchases, 0));
  const cashPaidOut = round(dailyRows.reduce((s, r) => s + r.payments, 0));
  const outstandingPayables = round(18400 + rng() * 6200);
  const netCashPosition = round(cashPaidOut - periodPurchases);

  const dailyPurchasesVsPayments = dailyRows.map((r) => ({
    date: r.date,
    label: r.dayOfWeek,
    purchases: r.purchases,
    payments: r.payments,
    net: r.net,
  }));

  let cumulative = 0;
  const cumulativeCashOutflow = dailyRows.map((r) => {
    cumulative = round(cumulative + r.payments);
    return {
      date: r.date,
      label: r.dayOfWeek,
      cumulativePayments: cumulative,
      cumulativePurchases: round(dailyRows.filter((d) => d.date <= r.date).reduce((s, d) => s + d.purchases, 0)),
    };
  });

  const categoryCostByDay = dailyRows.map((r) => {
    const point = { date: r.date, label: r.dayOfWeek, total: 0 };
    let allocated = 0;
    CATEGORIES.forEach((cat, i) => {
      const share = i === CATEGORIES.length - 1 ? r.purchases - allocated : round(r.purchases * (0.08 + rng() * 0.18));
      point[cat] = share;
      allocated += share;
      point.total += share;
    });
    point.total = round(point.total);
    return point;
  });

  const payablesAging = [
    { bucket: 'Current', amount: round(outstandingPayables * 0.42) },
    { bucket: '1–30 days', amount: round(outstandingPayables * 0.31) },
    { bucket: '31–60 days', amount: round(outstandingPayables * 0.18) },
    { bucket: '61+ days', amount: round(outstandingPayables * 0.09) },
  ];

  const largestPurchaseDay = [...dailyRows].sort((a, b) => b.purchases - a.purchases)[0];
  const avgDailyPurchases = round(periodPurchases / dailyRows.length);
  const avgDailyPayments = round(cashPaidOut / dailyRows.length);

  return {
    summary: {
      periodPurchases,
      cashPaidOut,
      outstandingPayables,
      netCashPosition,
      avgDailyPurchases,
      avgDailyPayments,
      purchaseToPaymentRatio: cashPaidOut ? round(periodPurchases / cashPaidOut, 2) : null,
      largestPurchaseDay: largestPurchaseDay
        ? { date: largestPurchaseDay.date, purchases: largestPurchaseDay.purchases }
        : null,
      daysInPeriod: dailyRows.length,
    },
    dailyPurchasesVsPayments,
    cumulativeCashOutflow,
    categoryCostByDay,
    payablesAging,
    tableRows: dailyRows,
    insights: [
      {
        id: 'purchases-vs-payments',
        impact: Math.abs(netCashPosition),
        text: `Period purchases ($${periodPurchases.toLocaleString()}) vs cash paid out ($${cashPaidOut.toLocaleString()}) — net position ${netCashPosition >= 0 ? '+' : ''}$${netCashPosition.toLocaleString()}. This is a payables/cash view, not full P&L.`,
      },
      {
        id: 'outstanding',
        impact: outstandingPayables,
        text: `$${outstandingPayables.toLocaleString()} in outstanding payables — review Payments module for aging and scheduled disbursements.`,
      },
      {
        id: 'peak-day',
        impact: largestPurchaseDay?.purchases || 0,
        text: largestPurchaseDay
          ? `Peak purchasing day was ${largestPurchaseDay.date} at $${largestPurchaseDay.purchases.toLocaleString()} — verify invoice accruals vs payment timing.`
          : 'No daily purchasing data in period.',
      },
      {
        id: 'avg-daily',
        impact: avgDailyPurchases,
        text: `Average daily purchases $${avgDailyPurchases.toLocaleString()} vs payments $${avgDailyPayments.toLocaleString()} — monitor cumulative cash outflow trend.`,
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      viewDefinition:
        'Daily Cost & Cash tracks invoice-based purchasing accruals and payment disbursements. Not POS revenue or full P&L.',
      sourceModules: MODULES,
      filterOptions: {
        categories: CATEGORIES,
        locations: LOCATIONS,
      },
    },
  };
}

export default getDailyCostCashDemoData;
