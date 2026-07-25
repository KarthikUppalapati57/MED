import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_SLUG = 'demo-summit-hospitality-group';
const REPAIR_SOURCE = 'summit_performance_repair';
const INVOICE_SOURCES = ['performance_demo_seed', 'summit_location_dummy_seed'];

const today = new Date();
const periodStart = process.env.PERFORMANCE_DATE_FROM
  || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const periodEnd = process.env.PERFORMANCE_DATE_TO
  || new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundQty(value) {
  return Number(Number(value || 0).toFixed(4));
}

function timestampFor(date, hour = 20) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

async function must(label, promise) {
  const { data, error, count } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? data;
}

async function loadSummit() {
  const org = await must('Summit organization', supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', ORG_SLUG)
    .single());

  const locations = await must('Summit locations', supabase
    .from('locations')
    .select('id, name, brand_id')
    .eq('organization_id', org.id)
    .order('name'));

  const profiles = await must('Summit users', supabase
    .from('profiles')
    .select('id, role, location_id')
    .eq('organization_id', org.id)
    .like('email', 'demo.performance.summit.%'));

  if (!locations.length) throw new Error('Summit locations are missing.');
  return { org, locations, profiles };
}

async function repairInvoiceAllocations(orgId) {
  const invoices = await must('Summit seeded invoices', supabase
    .from('invoices')
    .select('id')
    .eq('organization_id', orgId)
    .in('source', INVOICE_SOURCES));

  let relabeled = 0;
  for (let index = 0; index < invoices.length; index += 500) {
    const invoiceIds = invoices.slice(index, index + 500).map((invoice) => invoice.id);
    if (!invoiceIds.length) continue;
    const rows = await must('Relabel invoice allocations', supabase
      .from('invoice_allocations')
      .update({ allocation_type: 'line_items' })
      .in('invoice_id', invoiceIds)
      .eq('organization_id', orgId)
      .eq('allocation_type', 'category')
      .select('id'));
    relabeled += rows.length;
  }

  return { invoiceCount: invoices.length, relabeled };
}

async function deletePreviousRepairCounts(orgId) {
  const sessions = await must('Previous Summit repair count sessions', supabase
    .from('count_sessions')
    .select('id')
    .eq('organization_id', orgId)
    .contains('variance_data', { seed: REPAIR_SOURCE }));

  for (let index = 0; index < sessions.length; index += 500) {
    const ids = sessions.slice(index, index + 500).map((session) => session.id);
    await must('Delete previous Summit repair count sessions', supabase
      .from('count_sessions')
      .delete()
      .in('id', ids)
      .eq('organization_id', orgId));
  }

  const sheets = await must('Previous Summit repair count sheets', supabase
    .from('count_sheets')
    .select('id')
    .eq('organization_id', orgId)
    .like('name', 'Summit Performance Repair Count - %'));

  for (let index = 0; index < sheets.length; index += 500) {
    const ids = sheets.slice(index, index + 500).map((sheet) => sheet.id);
    await must('Delete previous Summit repair count sheets', supabase
      .from('count_sheets')
      .delete()
      .in('id', ids)
      .eq('organization_id', orgId));
  }

  return { deletedSessions: sessions.length, deletedSheets: sheets.length };
}
async function deletePreviousRepairMovements(orgId) {
  const rows = await must('Previous Summit repair movements', supabase
    .from('inventory_movements')
    .select('id')
    .eq('organization_id', orgId)
    .eq('source_type', REPAIR_SOURCE));

  for (let index = 0; index < rows.length; index += 500) {
    const ids = rows.slice(index, index + 500).map((row) => row.id);
    await must('Delete previous Summit repair movements', supabase
      .from('inventory_movements')
      .delete()
      .in('id', ids)
      .eq('organization_id', orgId));
  }

  return { deletedMovements: rows.length };
}

async function insertDemoTrendMovements({ org, location, countedBy }) {
  const inventoryRows = await must(`Trend inventory for ${location.name}`, supabase
    .from('inventory')
    .select('id, product_name, current_quantity, unit_cost')
    .eq('organization_id', org.id)
    .eq('location_id', location.id)
    .is('deleted_at', null)
    .order('product_name')
    .limit(12));

  const weekDates = [`${periodStart.slice(0, 8)}03`, `${periodStart.slice(0, 8)}10`, `${periodStart.slice(0, 8)}17`, `${periodStart.slice(0, 8)}24`];
  const movements = [];

  weekDates.forEach((date, weekIndex) => {
    inventoryRows.slice(weekIndex * 3, weekIndex * 3 + 3).forEach((row, rowIndex) => {
      const baseQty = 5 + weekIndex + rowIndex;
      movements.push({
        organization_id: org.id,
        location_id: location.id,
        inventory_id: row.id,
        movement_type: 'invoice_received',
        quantity: baseQty + 4,
        previous_quantity: Number(row.current_quantity || 0),
        new_quantity: Number(row.current_quantity || 0) + baseQty + 4,
        source_type: REPAIR_SOURCE,
        source_id: null,
        created_by: countedBy,
        created_at: timestampFor(date, 11),
      });
      movements.push({
        organization_id: org.id,
        location_id: location.id,
        inventory_id: row.id,
        movement_type: 'transfer_out',
        quantity: -(2 + rowIndex),
        previous_quantity: Number(row.current_quantity || 0) + baseQty + 4,
        new_quantity: Number(row.current_quantity || 0) + baseQty + 2 - rowIndex,
        source_type: REPAIR_SOURCE,
        source_id: null,
        created_by: countedBy,
        created_at: timestampFor(date, 15),
      });
      if ((weekIndex + rowIndex) % 2 === 0) {
        movements.push({
          organization_id: org.id,
          location_id: location.id,
          inventory_id: row.id,
          movement_type: 'wastage',
          quantity: -1,
          previous_quantity: Number(row.current_quantity || 0) + baseQty + 2 - rowIndex,
          new_quantity: Math.max(0, Number(row.current_quantity || 0) + baseQty + 1 - rowIndex),
          source_type: REPAIR_SOURCE,
          source_id: null,
          created_by: countedBy,
          created_at: timestampFor(date, 17),
        });
      }
    });
  });

  if (!movements.length) return { location: location.name, movements: 0 };
  await must(`Trend movements for ${location.name}`, supabase.from('inventory_movements').insert(movements));
  return { location: location.name, movements: movements.length };
}

async function repairRecipePressure(org, locations) {
  const results = [];
  for (const location of locations) {
    const recipes = await must(`Recipes for ${location.name}`, supabase
      .from('recipes')
      .select('id, name')
      .eq('organization_id', org.id)
      .eq('location_id', location.id)
      .order('name')
      .limit(8));

    let updated = 0;
    for (const [index, recipe] of recipes.slice(0, 3).entries()) {
      const cost = money(8.75 + index * 1.35);
      const price = money(11 + index * 1.5);
      const payload = {
        cost_per_serving: cost,
        total_cost: cost,
        selling_price: price,
        target_margin_percent: 62,
        margin_alert_enabled: true,
        margin_alert_status: 'active',
        last_costed_at: new Date().toISOString(),
      };
      let response = await supabase
        .from('recipes')
        .update(payload)
        .eq('id', recipe.id)
        .eq('organization_id', org.id)
        .select('id');
      if (response.error && response.error.message.includes('target_margin_percent')) {
        delete payload.target_margin_percent;
        response = await supabase
          .from('recipes')
          .update(payload)
          .eq('id', recipe.id)
          .eq('organization_id', org.id)
          .select('id');
      }
      if (response.error) throw new Error(`Recipe pressure ${recipe.name}: ${response.error.message}`);
      updated += response.data?.length || 0;
    }
    results.push({ location: location.name, pressureRecipes: updated, recipeCount: recipes.length });
  }
  return results;
}

async function loadMovementTotals(orgId, locationId) {
  const movements = await must('Summit inventory movements', supabase
    .from('inventory_movements')
    .select('inventory_id, movement_type, quantity, created_at')
    .eq('organization_id', orgId)
    .eq('location_id', locationId)
    .gte('created_at', timestampFor(periodStart, 0))
    .lte('created_at', timestampFor(periodEnd, 23)));

  const totals = new Map();
  for (const movement of movements) {
    const current = totals.get(movement.inventory_id) || {
      received: 0,
      transferIn: 0,
      transferOut: 0,
      adjustment: 0,
    };
    const quantity = Number(movement.quantity || 0);
    if (['purchase_order', 'invoice_received'].includes(movement.movement_type) && quantity > 0) {
      current.received += quantity;
    } else if (movement.movement_type === 'transfer_in' || (movement.movement_type === 'transfer' && quantity >= 0)) {
      current.transferIn += quantity;
    } else if (movement.movement_type === 'transfer_out' || (movement.movement_type === 'transfer' && quantity < 0)) {
      current.transferOut += Math.abs(quantity);
    } else if (movement.movement_type === 'manual_adjustment') {
      current.adjustment += quantity;
    }
    totals.set(movement.inventory_id, current);
  }
  return totals;
}

function makeCountPayload(inventoryRows, movementTotals, mode) {
  const countedData = {};
  const items = [];
  let totalValue = 0;

  inventoryRows.forEach((row, index) => {
    const unitCost = Number(row.unit_cost || row.product?.latest_price || 0);
    const closingQty = Math.max(0, Number(row.current_quantity || 0));
    const plannedUsage = 3 + (index % 7) + (index % 3 === 0 ? 5 : 0);
    const movement = movementTotals.get(row.id) || {
      received: 0,
      transferIn: 0,
      transferOut: 0,
      adjustment: 0,
    };
    const openingQty = Math.max(
      1,
      closingQty + plannedUsage - movement.received - movement.transferIn + movement.transferOut - movement.adjustment,
    );
    const quantity = mode === 'opening' ? openingQty : closingQty;
    const value = money(quantity * unitCost);

    countedData[row.id] = {
      product_name: row.product_name,
      expected_quantity: roundQty(quantity),
      counted_quantity: roundQty(quantity),
      quantity: roundQty(quantity),
      unit: row.current_unit || row.product?.base_unit || 'ea',
      unit_cost: money(unitCost),
      value,
    };

    items.push({
      inventory_id: row.id,
      product_id: row.internal_product_id || row.product_id || null,
      product_name: row.product_name,
      category: row.category || row.product?.category || 'Uncategorized',
      expected_quantity: roundQty(quantity),
      counted_quantity: roundQty(quantity),
      unit: row.current_unit || row.product?.base_unit || 'ea',
      unit_cost: money(unitCost),
      value,
    });
    totalValue += value;
  });

  return { countedData, items, totalValue: money(totalValue), itemCount: items.length };
}

async function insertCountPair({ org, location, countedBy }) {
  const inventoryRows = await must(`Inventory for ${location.name}`, supabase
    .from('inventory')
    .select('id, product_id, internal_product_id, product_name, category, current_quantity, current_unit, unit_cost, product:products(id, name, category, latest_price, base_unit)')
    .eq('organization_id', org.id)
    .eq('location_id', location.id)
    .is('deleted_at', null)
    .order('product_name'));

  if (!inventoryRows.length) return { location: location.name, inventory: 0, sessions: 0 };

  const movementTotals = await loadMovementTotals(org.id, location.id);
  const sheetItems = inventoryRows.map((row) => ({
    inventory_id: row.id,
    product_id: row.internal_product_id || row.product_id || null,
    product_name: row.product_name,
    category: row.category || row.product?.category || 'Uncategorized',
    expected_quantity: roundQty(row.current_quantity || 0),
    unit: row.current_unit || row.product?.base_unit || 'ea',
    unit_cost: money(row.unit_cost || row.product?.latest_price || 0),
  }));

  const sheet = await must(`Count sheet for ${location.name}`, supabase
    .from('count_sheets')
    .insert({
      organization_id: org.id,
      brand_id: location.brand_id,
      location_id: location.id,
      name: `Summit Performance Repair Count - ${location.name}`,
      description: `Demo opening/closing inventory counts for Performance analytics ${periodStart} to ${periodEnd}.`,
      items: sheetItems,
      created_by: countedBy,
    })
    .select('id')
    .single());

  const opening = makeCountPayload(inventoryRows, movementTotals, 'opening');
  const closing = makeCountPayload(inventoryRows, movementTotals, 'closing');
  const baseSession = {
    organization_id: org.id,
    location_id: location.id,
    brand_id: location.brand_id,
    count_sheet_id: sheet.id,
    status: 'completed',
    counted_by: countedBy,
  };

  await must(`Opening count for ${location.name}`, supabase
    .from('count_sessions')
    .insert({
      ...baseSession,
      count_date: periodStart,
      started_at: timestampFor(periodStart, 18),
      completed_at: timestampFor(periodStart, 20),
      closed_at: timestampFor(periodStart, 20),
      saved_at: timestampFor(periodStart, 19),
      counted_data: opening.countedData,
      items: opening.items,
      total_value: opening.totalValue,
      item_count: opening.itemCount,
      variance_data: { seed: REPAIR_SOURCE, kind: 'opening_count', location: location.name, periodStart, periodEnd },
      notes: 'Performance demo repair opening count.',
    })
    .select('id')
    .single());

  await must(`Closing count for ${location.name}`, supabase
    .from('count_sessions')
    .insert({
      ...baseSession,
      count_date: periodEnd,
      started_at: timestampFor(periodEnd, 18),
      completed_at: timestampFor(periodEnd, 20),
      closed_at: timestampFor(periodEnd, 20),
      saved_at: timestampFor(periodEnd, 19),
      counted_data: closing.countedData,
      items: closing.items,
      total_value: closing.totalValue,
      item_count: closing.itemCount,
      variance_data: { seed: REPAIR_SOURCE, kind: 'closing_count', location: location.name, periodStart, periodEnd },
      notes: 'Performance demo repair closing count.',
    })
    .select('id')
    .single());

  return { location: location.name, inventory: inventoryRows.length, sessions: 2 };
}

async function verifyReports(org, sampleLocationId) {
  const category = await must('Verify category performance report', supabase.rpc('get_category_performance_report', {
    p_organization_id: org.id,
    p_location_ids: [sampleLocationId],
    p_date_from: periodStart,
    p_date_to: periodEnd,
    p_comparison_date_from: null,
    p_comparison_date_to: null,
    p_category_names: null,
    p_vendor_ids: null,
    p_timezone: null,
    p_selected_category: null,
    p_trend_categories: null,
  }));

  const inventory = await must('Verify inventory usage report', supabase.rpc('get_inventory_usage_report', {
    p_organization_id: org.id,
    p_location_ids: [sampleLocationId],
    p_date_from: periodStart,
    p_date_to: periodEnd,
    p_category_names: null,
    p_timezone: null,
  }));

  return {
    categorySummary: category?.summary || null,
    categoryTrendPoints: Array.isArray(category?.trend) ? category.trend.length : 0,
    categoryRows: Array.isArray(category?.tableRows) ? category.tableRows.length : 0,
    inventorySummary: inventory?.summary || null,
    usageByCategory: Array.isArray(inventory?.usageByCategory) ? inventory.usageByCategory.length : 0,
    productRanking: Array.isArray(inventory?.productRanking) ? inventory.productRanking.length : 0,
    abc: Array.isArray(inventory?.abc) ? inventory.abc.length : 0,
  };
}

async function main() {
  const context = await loadSummit();
  const invoiceRepair = await repairInvoiceAllocations(context.org.id);
  const deleted = await deletePreviousRepairCounts(context.org.id);
  const deletedMovements = await deletePreviousRepairMovements(context.org.id);
  const recipePressureResults = await repairRecipePressure(context.org, context.locations);

  const trendMovementResults = [];
  for (const location of context.locations) {
    const manager = context.profiles.find((profile) => profile.location_id === location.id && profile.role === 'location_manager')
      || context.profiles.find((profile) => profile.role === 'tenant_super_admin')
      || context.profiles[0]
      || null;
    trendMovementResults.push(await insertDemoTrendMovements({
      org: context.org,
      location,
      countedBy: manager?.id || null,
    }));
  }

  const countResults = [];
  for (const location of context.locations) {
    const manager = context.profiles.find((profile) => profile.location_id === location.id && profile.role === 'location_manager')
      || context.profiles.find((profile) => profile.role === 'tenant_super_admin')
      || context.profiles[0]
      || null;
    countResults.push(await insertCountPair({
      org: context.org,
      location,
      countedBy: manager?.id || null,
    }));
  }

  const sampleLocation = context.locations.find((location) => location.name === 'Aster Kitchen Downtown') || context.locations[0];
  const verification = await verifyReports(context.org, sampleLocation.id);

  console.log(JSON.stringify({
    organization: context.org.name,
    periodStart,
    periodEnd,
    invoiceRepair,
    deletedPreviousRepairData: { ...deleted, ...deletedMovements },
    recipePressureResults,
    trendMovementResults,
    countResults,
    verificationLocation: sampleLocation.name,
    verification,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
