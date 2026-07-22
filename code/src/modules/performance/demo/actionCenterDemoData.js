/**
 * Development-only Action Center demo dataset.
 * Aggregated operational actions across modules. Never written to the database.
 */

const MODULES = ['Invoice', 'Inventory', 'Products', 'Payments', 'Recipes', 'Audit'];

const OWNERS = [
  'Maria Chen',
  'James Ortiz',
  'Priya Patel',
  'Alex Rivera',
  'Sam Nguyen',
  'Jordan Lee',
  'Unassigned',
];

const ACTION_TEMPLATES = [
  { severity: 'high', module: 'Invoice', description: 'Approve invoice batch exceeding policy limit — vendor US Foods' },
  { severity: 'high', module: 'Payments', description: 'Overdue payment to Sysco — $12,400 due 3 days ago' },
  { severity: 'high', module: 'Inventory', description: 'Critical count variance — Downtown produce cooler' },
  { severity: 'medium', module: 'Products', description: 'Unmapped invoice line items — 14 pending review' },
  { severity: 'medium', module: 'Recipes', description: 'Recipe cost spike — Burger Patty ingredient cost +18%' },
  { severity: 'medium', module: 'Invoice', description: 'Duplicate invoice detected — INV-2026-0842' },
  { severity: 'medium', module: 'Inventory', description: 'Transfer pending approval — Airport → Midtown' },
  { severity: 'low', module: 'Products', description: 'Category assignment missing for 8 new SKUs' },
  { severity: 'low', module: 'Recipes', description: 'Unit conversion gap — oz to each for Cola Syrup' },
  { severity: 'low', module: 'Audit', description: 'Approval policy change logged — review audit trail' },
  { severity: 'high', module: 'Audit', description: 'Unauthorized access attempt — user context switch blocked' },
  { severity: 'medium', module: 'Payments', description: 'Bank reconciliation variance — $340 unmatched' },
  { severity: 'low', module: 'Invoice', description: 'Email ingestion failed — malformed attachment' },
  { severity: 'high', module: 'Inventory', description: 'Negative on-hand quantity — Fry Cut Potatoes' },
  { severity: 'medium', module: 'Products', description: 'Vendor price list sync stale — 21 days old' },
  { severity: 'low', module: 'Payments', description: 'Scheduled payment reminder — due in 5 days' },
  { severity: 'medium', module: 'Recipes', description: 'Menu item margin below target — Classic Burger' },
  { severity: 'low', module: 'Audit', description: 'User role change — location_manager promotion' },
  { severity: 'high', module: 'Invoice', description: 'Three-way match failure — PO vs receipt vs invoice' },
  { severity: 'medium', module: 'Inventory', description: 'Waste log spike — +42% vs prior week' },
];

const STATUSES = ['open', 'in_progress', 'overdue', 'resolved'];

function createRng(seed = 17) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(n) {
  const d = new Date('2026-07-20');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date('2026-07-20');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildActionRows(rng) {
  return ACTION_TEMPLATES.map((template, idx) => {
    const statusRoll = rng();
    let status = 'open';
    let dueDate = daysFromNow(Math.floor(rng() * 10) + 1);

    if (statusRoll > 0.72) {
      status = 'resolved';
      dueDate = daysAgo(Math.floor(rng() * 5) + 1);
    } else if (statusRoll > 0.55) {
      status = 'in_progress';
    } else if (statusRoll > 0.38) {
      status = 'overdue';
      dueDate = daysAgo(Math.floor(rng() * 8) + 1);
    }

    return {
      id: `demo-action-${idx + 1}`,
      module: template.module,
      severity: template.severity,
      status,
      owner: OWNERS[Math.floor(rng() * OWNERS.length)],
      dueDate,
      createdDate: daysAgo(Math.floor(rng() * 14) + 2),
      description: template.description,
      ageDays: status === 'overdue' ? Math.floor(rng() * 12) + 1 : Math.floor(rng() * 20),
    };
  });
}

export function getActionCenterDemoData(params = {}) {
  const rng = createRng(33);
  let rows = buildActionRows(rng);

  if (params.moduleFilter?.length) {
    rows = rows.filter((r) => params.moduleFilter.includes(r.module));
  }

  const openActions = rows.filter((r) => r.status === 'open' || r.status === 'in_progress').length;
  const highSeverity = rows.filter(
    (r) => r.severity === 'high' && r.status !== 'resolved'
  ).length;
  const overdue = rows.filter((r) => r.status === 'overdue').length;
  const resolvedThisPeriod = rows.filter((r) => r.status === 'resolved').length;

  const actionsByModule = MODULES.map((module) => ({
    module,
    open: rows.filter((r) => r.module === module && r.status !== 'resolved').length,
    total: rows.filter((r) => r.module === module).length,
    high: rows.filter((r) => r.module === module && r.severity === 'high' && r.status !== 'resolved').length,
  }));

  const severityMix = ['high', 'medium', 'low'].map((severity) => ({
    severity,
    count: rows.filter((r) => r.severity === severity && r.status !== 'resolved').length,
    label: severity.charAt(0).toUpperCase() + severity.slice(1),
  }));

  const agingBuckets = [
    { bucket: '0–3 days', count: rows.filter((r) => r.status !== 'resolved' && r.ageDays <= 3).length },
    { bucket: '4–7 days', count: rows.filter((r) => r.status !== 'resolved' && r.ageDays >= 4 && r.ageDays <= 7).length },
    { bucket: '8–14 days', count: rows.filter((r) => r.status !== 'resolved' && r.ageDays >= 8 && r.ageDays <= 14).length },
    { bucket: '15+ days', count: rows.filter((r) => r.status !== 'resolved' && r.ageDays >= 15).length },
    { bucket: 'Overdue', count: overdue },
  ];

  const sorted = [...rows].sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    const stat = { overdue: 0, open: 1, in_progress: 2, resolved: 3 };
    return (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9) || (stat[a.status] ?? 9) - (stat[b.status] ?? 9);
  });

  return {
    summary: {
      openActions,
      highSeverity,
      overdue,
      resolvedThisPeriod,
      totalActions: rows.length,
      avgAgeDays: rows.filter((r) => r.status !== 'resolved').length
        ? Math.round(
            rows.filter((r) => r.status !== 'resolved').reduce((s, r) => s + r.ageDays, 0) /
              rows.filter((r) => r.status !== 'resolved').length
          )
        : 0,
    },
    actionsByModule,
    severityMix,
    agingBuckets,
    tableRows: sorted,
    insights: [
      {
        id: 'overdue',
        impact: overdue,
        text: `${overdue} action${overdue === 1 ? '' : 's'} ${overdue === 1 ? 'is' : 'are'} overdue — prioritize Payments and Invoice items with high severity.`,
      },
      {
        id: 'high-severity',
        impact: highSeverity,
        text: `${highSeverity} high-severity action${highSeverity === 1 ? '' : 's'} require immediate attention across Invoice, Inventory, and Audit modules.`,
      },
      {
        id: 'module-hotspot',
        impact: actionsByModule.sort((a, b) => b.open - a.open)[0]?.open || 0,
        text: `${actionsByModule.sort((a, b) => b.open - a.open)[0]?.module || 'Invoice'} has the most open actions (${actionsByModule.sort((a, b) => b.open - a.open)[0]?.open || 0}).`,
      },
      {
        id: 'resolved',
        impact: resolvedThisPeriod,
        text: `${resolvedThisPeriod} action${resolvedThisPeriod === 1 ? '' : 's'} resolved this period — ${openActions} still open or in progress.`,
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      sourceModules: MODULES,
      filterOptions: {
        modules: MODULES,
      },
    },
  };
}

export default getActionCenterDemoData;
