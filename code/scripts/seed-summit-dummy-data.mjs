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
const SEED_SOURCE = 'summit_location_dummy_seed';
const batchId = process.env.SUMMIT_DUMMY_BATCH_ID || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const categories = [
  { name: 'Dairy', gl: '5100', budget: 14200, unit: 'lb' },
  { name: 'Produce', gl: '5110', budget: 12800, unit: 'case' },
  { name: 'Proteins', gl: '5120', budget: 26500, unit: 'lb' },
  { name: 'Dry Goods', gl: '5130', budget: 11600, unit: 'lb' },
  { name: 'Packaging', gl: '5140', budget: 7200, unit: 'case' },
  { name: 'Beverages', gl: '5150', budget: 9600, unit: 'case' },
  { name: 'Cleaning', gl: '5200', budget: 4300, unit: 'case' },
  { name: 'Smallwares', gl: '5300', budget: 3600, unit: 'ea' },
];

const productTemplates = [
  ['Dairy', 'Butter Block', 4.4, 'lb'], ['Dairy', 'Whole Milk', 3.7, 'gal'], ['Dairy', 'Heavy Cream', 5.8, 'qt'], ['Dairy', 'Cheddar Loaf', 4.9, 'lb'], ['Dairy', 'Greek Yogurt', 4.2, 'qt'],
  ['Produce', 'Roma Tomato Case', 27, 'case'], ['Produce', 'Baby Spinach Case', 31, 'case'], ['Produce', 'Avocado Case', 42, 'case'], ['Produce', 'Mixed Herbs', 18, 'case'], ['Produce', 'Lemon Case', 36, 'case'],
  ['Proteins', 'Chicken Breast', 3.35, 'lb'], ['Proteins', 'Atlantic Salmon', 10.8, 'lb'], ['Proteins', 'Ground Beef', 4.9, 'lb'], ['Proteins', 'Pork Shoulder', 3.8, 'lb'], ['Proteins', 'Egg Flat', 3.1, 'flat'],
  ['Dry Goods', 'Arborio Rice', 1.95, 'lb'], ['Dry Goods', 'Penne Pasta', 1.22, 'lb'], ['Dry Goods', 'Bread Flour', 0.88, 'lb'], ['Dry Goods', 'Canned Chickpeas', 22, 'case'], ['Dry Goods', 'Olive Oil', 32, 'gal'],
  ['Packaging', 'Compostable Bowl', 42, 'case'], ['Packaging', 'Takeout Lid', 28, 'case'], ['Packaging', 'Kraft Bag', 21, 'case'], ['Packaging', 'Portion Cup', 18, 'case'], ['Packaging', 'Thermal Label Roll', 12, 'roll'],
  ['Beverages', 'Cold Brew Concentrate', 46, 'case'], ['Beverages', 'Sparkling Water', 19, 'case'], ['Beverages', 'House Lemonade Base', 25, 'case'], ['Beverages', 'Tea Sachets', 34, 'case'], ['Beverages', 'Espresso Beans', 13, 'lb'],
  ['Cleaning', 'Sanitizer Tabs', 29, 'case'], ['Cleaning', 'Degreaser', 24, 'case'], ['Cleaning', 'Dish Soap', 21, 'case'], ['Cleaning', 'Disposable Gloves', 39, 'case'], ['Cleaning', 'Towels', 16, 'case'],
  ['Smallwares', 'Sheet Pan', 11, 'ea'], ['Smallwares', 'Prep Container', 7, 'ea'], ['Smallwares', 'Chef Knife', 38, 'ea'], ['Smallwares', 'Cambro Lid', 5, 'ea'], ['Smallwares', 'Squeeze Bottle', 2.2, 'ea'],
];

const vendorTemplates = [
  ['Peak Dairy Collective', 'Dairy'], ['Front Range Produce', 'Produce'], ['Rocky Mountain Proteins', 'Proteins'], ['Summit Dry Goods', 'Dry Goods'],
  ['EcoPack Restaurant Supply', 'Packaging'], ['Craft Beverage Depot', 'Beverages'], ['CleanOps Supply', 'Cleaning'], ['Kitchenwares Direct', 'Smallwares'],
  ['Prime Coast Provisions', 'Proteins'], ['Freshline Distribution', 'Produce'], ['Regional Demo Supply', 'Dry Goods'], ['Performance Demo Foods', 'Dairy'],
];

const storyProfiles = [
  { key: 'healthy', budgetScale: 1.18, spendScale: 0.82, priceScale: 0.98, wasteScale: 0.45, marginScale: 1.16, paymentRisk: 0.25 },
  { key: 'watch', budgetScale: 1.0, spendScale: 1.04, priceScale: 1.09, wasteScale: 0.95, marginScale: 0.98, paymentRisk: 0.45 },
  { key: 'critical', budgetScale: 0.88, spendScale: 1.28, priceScale: 1.22, wasteScale: 1.55, marginScale: 0.78, paymentRisk: 0.68 },
];

function isoDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function previousMonthDate(day) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, day).toISOString().slice(0, 10);
}

function money(value) {
  return Number(value.toFixed(2));
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function maybe(label, promise) {
  const { error } = await promise;
  if (error) console.warn(`${label}: ${error.message}`);
}

function meta(kind, extra = {}) {
  return { seed: SEED_SOURCE, batchId, kind, ...extra };
}

async function loadSummitContext() {
  const org = await must('Summit org', supabase
    .from('organizations')
    .select('id, name, slug, tenant_id')
    .eq('slug', ORG_SLUG)
    .single());

  const brands = await must('Summit brands', supabase
    .from('brands')
    .select('brand_id, name')
    .eq('organization_id', org.id)
    .order('name'));

  const locations = await must('Summit locations', supabase
    .from('locations')
    .select('id, name, brand_id')
    .eq('organization_id', org.id)
    .order('name'));

  const profiles = await must('Summit demo profiles', supabase
    .from('profiles')
    .select('id, email, role, brand_id, location_id')
    .eq('organization_id', org.id)
    .like('email', 'demo.performance.summit.%'));

  const tenantAdmin = profiles.find((profile) => profile.role === 'tenant_super_admin') || profiles[0] || null;
  if (!brands.length || locations.length < 9) throw new Error('Summit hierarchy is missing brands or locations. Run seed:performance-demo first.');
  return { org, brands, locations, profiles, tenantAdmin };
}

function managerForLocation(context, locationId) {
  return context.profiles.find((profile) => profile.location_id === locationId && profile.role === 'location_manager') || context.tenantAdmin;
}

async function seedLocation(context, brand, location, locationIndex) {
  const story = storyProfiles[locationIndex % 3];
  const manager = managerForLocation(context, location.id);
  const locationSlug = location.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const vendors = [];
  const products = [];
  const inventoryRows = [];

  for (const [index, [vendorName, category]] of vendorTemplates.entries()) {
    const vendor = await must(`vendor ${location.name} ${vendorName}`, supabase
      .from('vendors')
      .insert({
        accounting_vendor_id: `SUMMIT-DUMMY-${batchId}-${locationSlug}-V${index + 1}`,
        accounting_vendor_name: vendorName,
        ap_routing_preference: index % 4 === 0 ? 'accounting' : 'payments',
        approval_status: 'approved',
        autopay_enabled: index % 3 === 0,
        brand_id: brand.brand_id,
        contact_name: `${vendorName} AP Desk`,
        default_expense_category: category,
        default_payment_method: index % 2 === 0 ? 'stripe' : 'check',
        email: `ap+${locationSlug}.${index + 1}@summit-dummy-vendor.test`,
        file_routing_preference: 'storage',
        health_score: Math.max(55, 96 - index * 2 - locationIndex * 5),
        location_id: location.id,
        name: `${vendorName} - ${location.name}`,
        onboarding_status: 'completed',
        organization_id: context.org.id,
        status: 'active',
        total_spent: money((85000 + index * 7200) * story.spendScale),
        unpaid_ap: money((1800 + index * 420) * story.paymentRisk),
      })
      .select('id, name, default_expense_category')
      .single());
    vendors.push(vendor);
  }

  for (const [index, template] of productTemplates.entries()) {
    const [category, baseName, baseCost, unit] = template;
    const vendor = vendors.find((item) => item.default_expense_category === category) || vendors[index % vendors.length];
    const priceMove = 1 + ((index % 5) - 2) * 0.025;
    const latestPrice = money(baseCost * story.priceScale * priceMove);
    const productName = `${location.name} ${baseName} ${batchId}`;
    const product = await must(`product ${productName}`, supabase
      .from('products')
      .insert({
        accounting_category: category === 'Cleaning' ? 'cleaning' : category === 'Packaging' ? 'packaging' : category === 'Smallwares' ? 'equipment' : category,
        average_price: baseCost,
        base_unit: unit,
        brand_id: brand.brand_id,
        category,
        category_confidence: 0.96,
        category_review_status: 'approved',
        category_source: 'manual',
        description: `Summit dummy ${story.key} product for ${location.name}.`,
        is_inventoried: true,
        latest_price: latestPrice,
        location_id: location.id,
        location_specific: true,
        locations: [location.id],
        name: productName,
        organization_id: context.org.id,
        par_level: 40 + (index % 8) * 8,
        price_history: [
          { date: previousMonthDate(7 + (index % 15)), price: money(baseCost * 0.94), vendor: vendor.name },
          { date: isoDate(-16 + (index % 10)), price: latestPrice, vendor: vendor.name },
        ],
        product_id: `SUMMIT-DUMMY-${batchId}-${locationSlug}-P${index + 1}`,
        reorder_point: 12 + (index % 6) * 4,
        report_by_unit: unit,
        report_unit_quantity: 1,
        status: 'active',
        vendor_name: vendor.name,
      })
      .select('id, name, category, latest_price, average_price, base_unit, product_id, par_level, reorder_point, vendor_name')
      .single());
    products.push({ ...product, unit, baseCost, latestCost: latestPrice, vendor });

    const quantityRatio = story.key === 'healthy' ? 0.82 : story.key === 'watch' ? 0.58 : 0.34;
    const par = Number(product.par_level || 50);
    const qty = Math.max(2, Math.round(par * (quantityRatio + (index % 4) * 0.035)));
    const inventory = await must(`inventory ${productName}`, supabase
      .from('inventory')
      .insert({
        accounting_category: product.category,
        brand_id: brand.brand_id,
        category: product.category,
        current_quantity: qty,
        current_unit: unit,
        current_value: money(qty * latestPrice),
        internal_product_id: product.id,
        last_counted_date: isoDate(-1 - (index % 5)),
        location: location.name,
        location_id: location.id,
        organization_id: context.org.id,
        par_level: product.par_level,
        previous_quantity: Math.round(qty * (story.key === 'critical' ? 1.35 : 1.12)),
        previous_value: money(qty * baseCost),
        product_id: product.product_id,
        product_name: product.name,
        reorder_point: product.reorder_point,
        unit_cost: latestPrice,
      })
      .select('id, product_name, location_id, current_quantity, current_unit, unit_cost')
      .single());
    inventoryRows.push({ ...inventory, product, brand, location });
  }

  for (const [catIndex, category] of categories.entries()) {
    const target = money(category.budget * story.budgetScale * (1 + catIndex * 0.018));
    await must(`budget ${location.name} ${category.name}`, supabase
      .from('budget_targets')
      .upsert({
        brand_id: brand.brand_id,
        category: category.name,
        created_by: manager?.id || null,
        location_id: location.id,
        organization_id: context.org.id,
        period_start: startOfMonth(),
        period_end: endOfMonth(),
        target_amount: target,
        target_percent: null,
        updated_by: manager?.id || null,
      }, { onConflict: 'organization_id,brand_id,location_id,period_start,period_end,category' })
      .select('id')
      .single());
  }

  for (let invoiceIndex = 0; invoiceIndex < 20; invoiceIndex += 1) {
    const vendor = vendors[invoiceIndex % vendors.length];
    const isPrevious = invoiceIndex < 3;
    const invoiceDate = isPrevious ? previousMonthDate(4 + invoiceIndex * 5) : isoDate(-1 - invoiceIndex);
    const lineCount = 8 + (invoiceIndex % 5);
    const selected = Array.from({ length: lineCount }, (_, lineIndex) => products[(invoiceIndex * 3 + lineIndex) % products.length]);
    const lineItems = selected.map((product, lineIndex) => {
      const qty = 4 + (lineIndex % 5) * 2 + Math.floor(invoiceIndex / 4);
      const linePressure = isPrevious ? 0.88 : story.spendScale * (1 + lineIndex * 0.018);
      const unitPrice = money(product.latestCost * linePressure);
      return {
        product,
        item_name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        total_price: money(qty * unitPrice),
        vendor_unit: product.unit,
      };
    });
    const subtotal = money(lineItems.reduce((sum, item) => sum + item.total_price, 0));
    const tax = money(subtotal * 0.0635);
    const delivery = 18 + (invoiceIndex % 4) * 4;
    const total = money(subtotal + tax + delivery);
    const invoiceNumber = `SUMMIT-DUMMY-${batchId}-${locationSlug}-${String(invoiceIndex + 1).padStart(3, '0')}`;

    const invoice = await must(`invoice ${invoiceNumber}`, supabase
      .from('invoices')
      .insert({
        account_number: `SUMMIT-${locationSlug.toUpperCase().slice(0, 10)}`,
        brand_id: brand.brand_id,
        currency: 'USD',
        delivery_fee: delivery,
        due_date: isoDate(10 + (invoiceIndex % 14)),
        invoice_date: invoiceDate,
        invoice_number: invoiceNumber,
        line_items: lineItems.map(({ product: _product, ...item }) => item),
        location: location.name,
        location_id: location.id,
        organization_id: context.org.id,
        paid_amount: 0,
        payment_status: 'unpaid',
        raw_text: `Summit dummy invoice for ${location.name}.`,
        source: SEED_SOURCE,
        status: 'pending_review',
        ap_status: 'processing',
        subtotal,
        tax_amount: tax,
        tenant_id: context.org.tenant_id,
        total_amount: total,
        validation_results: meta('invoice', { story: story.key, location: location.name }),
        vendor_id: vendor.id,
        vendor_name: vendor.name,
      })
      .select('id, invoice_number, total_amount')
      .single());

    for (const item of lineItems) {
      await must(`line item ${invoiceNumber} ${item.item_name}`, supabase
        .from('invoice_line_items')
        .insert({
          internal_product_id: item.product.id,
          invoice_id: invoice.id,
          item_name: item.item_name,
          organization_id: context.org.id,
          price_variance_flag: item.unit_price > item.product.baseCost * 1.12,
          price_variance_percent: money(((item.unit_price - item.product.baseCost) / item.product.baseCost) * 100),
          quantity: item.quantity,
          total_price: item.total_price,
          unit_price: item.unit_price,
          vendor_id: vendor.id,
          vendor_item_code: `${item.product.category.slice(0, 3).toUpperCase()}-${Math.round(item.product.latestCost * 100)}`,
          vendor_unit: item.vendor_unit,
        })
        .select('id')
        .single());
    }

    const spendByCategory = new Map();
    for (const item of lineItems) {
      const value = money((spendByCategory.get(item.product.category) || 0) + item.total_price);
      spendByCategory.set(item.product.category, value);
    }
    for (const [categoryName, amount] of spendByCategory.entries()) {
      await must(`allocation ${invoiceNumber} ${categoryName}`, supabase
        .from('invoice_allocations')
        .insert({
          allocation_type: 'line_items',
          amount,
          category_name: categoryName,
          gl_code: categories.find((category) => category.name === categoryName)?.gl || '5999',
          invoice_id: invoice.id,
          location_id: location.id,
          organization_id: context.org.id,
          percentage: money((amount / subtotal) * 100),
        })
        .select('id')
        .single());
    }

    await must(`finalize invoice ${invoiceNumber}`, supabase
      .from('invoices')
      .update({
        ap_status: 'scheduled',
        paid_amount: 0,
        payment_status: 'unpaid',
        status: 'scheduled',
      })
      .eq('id', invoice.id)
      .select('id')
      .single());

    const paymentStatus = invoiceIndex % 6 === 0 ? 'failed' : invoiceIndex % 4 === 0 ? 'completed' : 'pending';
    await must(`payment ${invoiceNumber}`, supabase
      .from('payments')
      .insert({
        amount: paymentStatus === 'completed' ? total : money(total * (story.paymentRisk + 0.15)),
        brand_id: brand.brand_id,
        created_by: manager?.id || null,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        location_id: location.id,
        notes: `Summit dummy ${story.key} payment exposure.`,
        organization_id: context.org.id,
        payment_date: isoDate(-invoiceIndex),
        payment_method: invoiceIndex % 2 === 0 ? 'ach' : 'card',
        payout_status: paymentStatus === 'failed' ? 'failed' : 'pending_approval',
        status: paymentStatus,
        tenant_id: context.org.tenant_id,
        transaction_id: `SUMMIT-DUMMY-PAY-${batchId}-${locationSlug}-${invoiceIndex + 1}`,
        vendor_id: vendor.id,
        vendor_name: vendor.name,
      })
      .select('id')
      .single());
  }

  for (const [index, row] of inventoryRows.entries()) {
    if (index % 2 === 0) {
      await maybe(`movement receipt ${row.product_name}`, supabase.from('inventory_movements').insert({
        created_by: manager?.id || null,
        inventory_id: row.id,
        location_id: location.id,
        movement_type: 'invoice_received',
        new_quantity: Number(row.current_quantity || 0),
        organization_id: context.org.id,
        previous_quantity: Math.max(0, Number(row.current_quantity || 0) - 10),
        quantity: 10,
        source_type: SEED_SOURCE,
      }));
    }
    if (index % 3 === 0) {
      const used = story.key === 'critical' ? 9 : story.key === 'watch' ? 6 : 3;
      await maybe(`movement usage ${row.product_name}`, supabase.from('inventory_movements').insert({
        created_by: manager?.id || null,
        inventory_id: row.id,
        location_id: location.id,
        movement_type: 'manual_adjustment',
        new_quantity: Math.max(0, Number(row.current_quantity || 0) - used),
        organization_id: context.org.id,
        previous_quantity: Number(row.current_quantity || 0),
        quantity: -used,
        source_type: SEED_SOURCE,
      }));
    }
    if (index % 5 === 0) {
      const wasteQty = story.key === 'critical' ? 5 : story.key === 'watch' ? 3 : 1;
      await must(`waste ${row.product_name}`, supabase.from('wastage_logs').insert({
        brand_id: brand.brand_id,
        location: location.name,
        location_id: location.id,
        logged_by: manager?.id || null,
        notes: `Summit dummy ${story.key} waste event.`,
        organization_id: context.org.id,
        product_id: row.product.id,
        product_name: row.product.name,
        quantity: wasteQty,
        reason: story.key === 'healthy' ? 'other' : 'spoiled',
        unit: row.current_unit,
        value: money(wasteQty * Number(row.unit_cost || 0) * story.wasteScale),
      }).select('id').single());
    }
  }

  const countedData = {};
  for (const row of inventoryRows.slice(0, 18)) {
    countedData[row.id] = {
      product_name: row.product_name,
      quantity: Math.max(1, Math.round(Number(row.current_quantity || 0) * (story.key === 'critical' ? 0.76 : 0.93))),
      unit: row.current_unit,
    };
  }
  await must(`count session ${location.name}`, supabase.from('count_sessions').insert({
    completed_at: `${isoDate(-1)}T22:00:00.000Z`,
    counted_by: manager?.id || null,
    counted_data: countedData,
    organization_id: context.org.id,
    started_at: `${isoDate(-1)}T20:00:00.000Z`,
    status: 'completed',
    variance_data: meta('inventory_count', { story: story.key, location: location.name }),
  }).select('id').single());

  const recipeProducts = products.filter((product) => ['Dairy', 'Produce', 'Proteins', 'Dry Goods', 'Packaging', 'Beverages'].includes(product.category));
  const recipeNames = ['Grain Bowl', 'Herb Chicken Plate', 'Salmon Salad', 'Cold Brew Service', 'Tomato Pasta', 'Market Burger', 'Breakfast Scramble', 'Catering Box'];
  for (const [recipeIndex, recipeName] of recipeNames.entries()) {
    const ingredients = recipeProducts.slice(recipeIndex * 3, recipeIndex * 3 + 5).map((product, ingredientIndex) => ({
      product_id: product.id,
      product_name: product.name,
      quantity: money(0.35 + ingredientIndex * 0.18),
      unit: product.unit,
      unit_cost: product.latestCost,
      total_cost: money((0.35 + ingredientIndex * 0.18) * product.latestCost),
    }));
    const ingredientCost = money(ingredients.reduce((sum, item) => sum + item.total_cost, 0));
    const laborCost = money((8 + recipeIndex * 1.15) * (story.key === 'critical' ? 1.18 : 1));
    const packagingCost = money((recipeIndex % 3 + 1) * 0.42 * story.priceScale);
    const totalCost = money((ingredientCost + laborCost + packagingCost) / story.marginScale);
    const sellingPrice = money(totalCost * (story.key === 'critical' ? 1.48 : story.key === 'watch' ? 1.86 : 2.35));
    await must(`recipe ${location.name} ${recipeName}`, supabase.from('recipes').insert({
      brand_id: brand.brand_id,
      category: recipeIndex % 3 === 3 ? 'Beverage' : 'Entree',
      cook_time_minutes: 8 + recipeIndex * 2,
      cost_per_serving: money(totalCost / 8),
      created_by: manager?.id || null,
      description: `Summit ${story.key} dummy recipe for ${location.name}.`,
      ingredients,
      instructions: 'Prep, portion, finish, and serve according to house standards.',
      labor_cost: laborCost,
      labor_rate_per_hour: 22,
      labor_time_minutes: 18 + recipeIndex * 3,
      last_costed_at: new Date().toISOString(),
      location_id: location.id,
      margin_alert_enabled: true,
      margin_alert_status: story.key === 'critical' ? 'active' : 'none',
      name: `${location.name} ${recipeName} ${batchId}`,
      organization_id: context.org.id,
      packaging_items: [{ name: 'Service packaging', cost: packagingCost }],
      prep_time_minutes: 14 + recipeIndex * 2,
      selling_price: sellingPrice,
      status: recipeIndex % 7 === 0 ? 'seasonal' : 'active',
      suggested_price: sellingPrice,
      target_margin_percent: story.key === 'critical' ? 72 : 68,
      total_cost: totalCost,
      total_ingredient_cost: ingredientCost,
      total_packaging_cost: packagingCost,
      yield_quantity: 8,
      yield_unit: 'servings',
    }).select('id').single());
  }

  const alertTitle = story.key === 'critical' ? 'Critical COGS and inventory risk' : story.key === 'watch' ? 'Budget watch trend detected' : 'Location performance on target';
  await must(`notification ${location.name}`, supabase.from('notifications').insert({
    brand_id: brand.brand_id,
    is_read: story.key === 'healthy',
    link: '/performance',
    location_id: location.id,
    message: `${location.name} is seeded as ${story.key}; review Performance for budget, price, payment, and recipe signals.`,
    metadata: meta('notification', { story: story.key, location: location.name }),
    organization_id: context.org.id,
    priority: story.key === 'critical' ? 'high' : story.key === 'watch' ? 'medium' : 'low',
    title: alertTitle,
    type: story.key === 'healthy' ? 'system' : 'alert',
    user_id: manager?.id || null,
  }).select('id').single());

  for (const action of ['seed_products', 'seed_invoices', 'seed_inventory', 'seed_recipes']) {
    await maybe(`audit ${location.name} ${action}`, supabase.from('audit_logs').insert({
      action,
      brand_id: brand.brand_id,
      details: `Summit dummy ${story.key} data inserted for ${location.name}.`,
      entity_type: 'demo_seed',
      field_changed: 'dummy_data',
      location_id: location.id,
      module: action.replace('seed_', ''),
      new_data: meta('audit', { action, story: story.key, location: location.name }),
      organization_id: context.org.id,
      table_name: action.replace('seed_', ''),
      user_email: manager?.email || null,
      user_id: manager?.id || null,
    }));
  }

  return {
    location: location.name,
    story: story.key,
    vendors: vendors.length,
    products: products.length,
    inventory: inventoryRows.length,
    invoices: 20,
    recipes: 8,
  };
}

async function seedCustomReports(context) {
  const existing = await must('existing Summit dummy custom reports', supabase
    .from('custom_reports')
    .select('id')
    .eq('organization_id', context.org.id)
    .like('name', `Summit Dummy % ${batchId}`));
  if (existing.length) return;

  const reportNames = [
    ['Summit Dummy Budget Variance', 'Budget vs actual by brand, location, and category.'],
    ['Summit Dummy Payment Exposure', 'Unpaid, pending, completed, and failed payment movement.'],
    ['Summit Dummy Inventory Risk', 'Low stock, count variance, and waste pressure.'],
    ['Summit Dummy Recipe Margin', 'Recipe cost, target margin, and margin alerts.'],
  ];
  for (const [name, description] of reportNames) {
    await must(`custom report ${name}`, supabase.from('custom_reports').insert({
      created_by: context.tenantAdmin?.id || null,
      description,
      name: `${name} ${batchId}`,
      organization_id: context.org.id,
      query_config: meta('custom_report', { description }),
    }).select('id').single());
  }
}

const context = await loadSummitContext();
const summaries = [];
for (const brand of context.brands) {
  const brandLocations = context.locations
    .filter((location) => location.brand_id === brand.brand_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const [index, location] of brandLocations.entries()) {
    summaries.push(await seedLocation(context, brand, location, index));
  }
}
await seedCustomReports(context);

console.log(`\nSummit dummy data seed complete. Batch: ${batchId}\n`);
console.table(summaries);
console.log('Organization:', context.org.name);
console.log('Locations seeded:', summaries.length);
