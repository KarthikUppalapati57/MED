import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.PERFORMANCE_DEMO_PASSWORD || process.env.ROLE_QA_PASSWORD;
const EMAIL_NAMESPACE = 'demo.performance';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!PASSWORD || PASSWORD === 'your_qa_account_password') {
  console.error('Set PERFORMANCE_DEMO_PASSWORD to a real password before creating demo auth users.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MODULES = [
  'dashboard',
  'dashboard_reports',
  'invoices',
  'payments',
  'inventory_management',
  'recipe_management',
  'performance',
  'custom_reports',
  'vendor_management',
  'audit_logs',
  'organization_management',
];
const CATEGORIES = ['Dairy', 'Produce', 'Proteins', 'Dry Goods', 'Packaging', 'Beverages'];
const PRODUCT_CATALOG = [
  { category: 'Dairy', name: 'Cultured Butter', unit: 'lb', baseCost: 4.2, latestCost: 5.1, reorder: 18, par: 42 },
  { category: 'Dairy', name: 'Whole Milk', unit: 'gal', baseCost: 3.4, latestCost: 3.95, reorder: 24, par: 60 },
  { category: 'Produce', name: 'Roma Tomatoes', unit: 'case', baseCost: 24, latestCost: 28, reorder: 9, par: 22 },
  { category: 'Produce', name: 'Baby Spinach', unit: 'case', baseCost: 31, latestCost: 29, reorder: 7, par: 18 },
  { category: 'Proteins', name: 'Chicken Breast', unit: 'lb', baseCost: 3.1, latestCost: 3.85, reorder: 45, par: 110 },
  { category: 'Proteins', name: 'Atlantic Salmon', unit: 'lb', baseCost: 9.8, latestCost: 11.4, reorder: 24, par: 58 },
  { category: 'Dry Goods', name: 'Arborio Rice', unit: 'lb', baseCost: 1.85, latestCost: 2.1, reorder: 35, par: 90 },
  { category: 'Dry Goods', name: 'Penne Pasta', unit: 'lb', baseCost: 1.15, latestCost: 1.05, reorder: 40, par: 100 },
  { category: 'Packaging', name: 'Compostable Bowls', unit: 'case', baseCost: 38, latestCost: 44, reorder: 8, par: 24 },
  { category: 'Beverages', name: 'Cold Brew Concentrate', unit: 'case', baseCost: 42, latestCost: 47, reorder: 6, par: 18 },
];

const demoTenants = [
  {
    name: 'Summit Hospitality Group Demo',
    slug: 'demo-summit-hospitality-group',
    emailPrefix: 'summit',
    brands: [
      { name: 'Aster Kitchen', city: 'Denver', locations: ['Aster Kitchen Downtown', 'Aster Kitchen Union Station', 'Aster Kitchen Tech Center'] },
      { name: 'Copper & Sage', city: 'Boulder', locations: ['Copper & Sage Pearl', 'Copper & Sage Flatirons', 'Copper & Sage Table Mesa'] },
      { name: 'Northline Provisions', city: 'Fort Collins', locations: ['Northline Old Town', 'Northline Campus', 'Northline Foothills'] },
    ],
  },
  {
    name: 'Harborstone Restaurant Collective Demo',
    slug: 'demo-harborstone-restaurant-collective',
    emailPrefix: 'harborstone',
    brands: [
      { name: 'Harbor & Hearth', city: 'Charleston', locations: ['Harbor & Hearth King Street', 'Harbor & Hearth Market', 'Harbor & Hearth Waterfront'] },
      { name: 'Juniper Social', city: 'Savannah', locations: ['Juniper Social Historic', 'Juniper Social River', 'Juniper Social Midtown'] },
      { name: 'Blue Meridian', city: 'Wilmington', locations: ['Blue Meridian Pier', 'Blue Meridian Forum', 'Blue Meridian Garden'] },
    ],
  },
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

function demoMeta(orgSlug, kind = 'performance_demo') {
  return { seed: 'performance-professional-demo', orgSlug, kind };
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

async function findUserByEmail(email) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn(`listUsers failed for ${email}: ${error.message}. Trying direct create path.`);
      return null;
    }
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function upsertUser({ email, fullName, role }, context) {
  const profileMatch = await must('profile lookup ' + email, supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle());
  if (profileMatch?.id) return { id: profileMatch.id, email };

  const metadata = {
    demo_account: true,
    demo_scope: 'performance-professional-demo',
    full_name: fullName,
    tenant_id: context.tenantId || null,
    organization_id: context.organizationId || null,
    brand_id: context.brandId || null,
    location_id: context.locationId || null,
    role,
  };
  const existing = await findUserByEmail(email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata || {}), ...metadata },
      email_confirm: true,
      password: PASSWORD,
      user_metadata: { ...(existing.user_metadata || {}), ...metadata },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    app_metadata: metadata,
    email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user;
}

async function seedProfile(account, user, context) {
  await must(`profile ${account.email}`, supabase
    .from('profiles')
    .upsert({
      access_level: account.accessLevel,
      brand_id: context.brandId || null,
      email: account.email,
      full_name: account.fullName,
      id: user.id,
      location_id: context.locationId || null,
      organization_id: context.organizationId || null,
      tenant_id: context.tenantId || null,
      role: account.role,
      status: 'active',
    }, { onConflict: 'id' })
    .select('id')
    .single());

  if (context.organizationId) {
    await maybe(`org member ${account.email}`, supabase.from('organization_members').upsert({
      organization_id: context.organizationId,
      role: account.role,
      user_id: user.id,
    }, { onConflict: 'organization_id,user_id' }));
  }
  if (context.brandId) {
    await maybe(`brand member ${account.email}`, supabase.from('brand_members').upsert({
      brand_id: context.brandId,
      role: account.role,
      user_id: user.id,
    }, { onConflict: 'brand_id,user_id' }));
  }
  if (context.locationId) {
    await maybe(`location member ${account.email}`, supabase.from('location_members').upsert({
      location_id: context.locationId,
      role: account.role,
      user_id: user.id,
    }, { onConflict: 'location_id,user_id' }));
  }
}

async function seedHierarchy(tenant) {
  const tenantRow = await must(`tenant ${tenant.name}`, supabase
    .from('tenants')
    .upsert({
      name: tenant.name,
      slug: tenant.slug,
      status: 'active',
      metadata: demoMeta(tenant.slug, 'tenant'),
    }, { onConflict: 'slug' })
    .select('id, name, slug')
    .single());

  const org = await must(`organization ${tenant.name}`, supabase
    .from('organizations')
    .upsert({
      tenant_id: tenantRow.id,
      name: tenant.name,
      slug: tenant.slug,
      status: 'active',
      subscription_plan: 'enterprise',
      subscription_status: 'active',
      enabled_modules: MODULES,
      primary_contact_email: `${EMAIL_NAMESPACE}.${tenant.emailPrefix}.tenant@restops.test`,
    }, { onConflict: 'slug' })
    .select('id, name, slug, tenant_id')
    .single());

  const brands = [];
  const locationsByBrand = [];
  for (const brandDef of tenant.brands) {
    const existingBrand = await must(`find brand ${brandDef.name}`, supabase
      .from('brands')
      .select('brand_id, name')
      .eq('organization_id', org.id)
      .eq('name', brandDef.name)
      .maybeSingle());
    const brand = existingBrand || await must(`insert brand ${brandDef.name}`, supabase
      .from('brands')
      .insert({ organization_id: org.id, name: brandDef.name })
      .select('brand_id, name')
      .single());
    brands.push(brand);

    const locations = [];
    for (const [locationIndex, locationName] of brandDef.locations.entries()) {
      const existingLocation = await must(`find location ${locationName}`, supabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', org.id)
        .eq('name', locationName)
        .maybeSingle());
      const locationPayload = {
        address: `${100 + locationIndex} ${brandDef.city} Demo Avenue`,
        brand_id: brand.brand_id,
        is_commissary: false,
        name: locationName,
        organization_id: org.id,
      };
      const location = existingLocation
        ? await must(`update location ${locationName}`, supabase.from('locations').update(locationPayload).eq('id', existingLocation.id).select('id, name').single())
        : await must(`insert location ${locationName}`, supabase.from('locations').insert(locationPayload).select('id, name').single());
      locations.push(location);
    }
    locationsByBrand.push(locations);
  }

  return { org, tenant: tenantRow, brands, locationsByBrand };
}

function accountsForTenant(tenant, context) {
  const accounts = [
    {
      email: `${EMAIL_NAMESPACE}.${tenant.emailPrefix}.tenant@restops.test`,
      fullName: `${tenant.name.replace(' Demo', '')} Tenant Super Admin`,
      role: 'tenant_super_admin',
      accessLevel: 'organization',
      organizationId: context.org.id,
    },
    {
      email: `${EMAIL_NAMESPACE}.${tenant.emailPrefix}.org@restops.test`,
      fullName: `${tenant.name.replace(' Demo', '')} Organization Manager`,
      role: 'org_manager',
      accessLevel: 'organization',
      organizationId: context.org.id,
    },
  ];

  for (const [brandIndex, brand] of context.brands.entries()) {
    const brandSlug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    accounts.push({
      email: `${EMAIL_NAMESPACE}.${tenant.emailPrefix}.${brandSlug}.brand@restops.test`,
      fullName: `${brand.name} Brand Manager`,
      role: 'branch_manager',
      accessLevel: 'brand',
      organizationId: context.org.id,
      brandId: brand.brand_id,
    });

    for (const [locationIndex, location] of context.locationsByBrand[brandIndex].entries()) {
      const locationSlug = location.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
      accounts.push({
        email: `${EMAIL_NAMESPACE}.${tenant.emailPrefix}.${locationSlug}.manager@restops.test`,
        fullName: `${location.name} Location Manager`,
        role: 'location_manager',
        accessLevel: 'location',
        organizationId: context.org.id,
        brandId: brand.brand_id,
        locationId: location.id,
      });
      accounts.push({
        email: `${EMAIL_NAMESPACE}.${tenant.emailPrefix}.${locationSlug}.staff@restops.test`,
        fullName: `${location.name} Ground Staff`,
        role: 'ground_staff',
        accessLevel: 'location',
        organizationId: context.org.id,
        brandId: brand.brand_id,
        locationId: location.id,
        permissions: {
          Dashboard: 'read',
          Invoices: locationIndex % 2 === 0 ? 'full' : 'read',
          Inventory: 'read',
          Recipes: 'read',
          Performance: 'read',
        },
      });
    }
  }
  return accounts;
}

async function clearDemoData(orgId) {
  const invoiceIds = (await must('demo invoices for cleanup', supabase.from('invoices').select('id').eq('organization_id', orgId))).map((row) => row.id);
  if (invoiceIds.length) {
    await maybe('delete invoice allocations', supabase.from('invoice_allocations').delete().in('invoice_id', invoiceIds));
    await maybe('delete invoice line items', supabase.from('invoice_line_items').delete().in('invoice_id', invoiceIds));
  }
  await maybe('delete payments', supabase.from('payments').delete().eq('organization_id', orgId));
  await maybe('delete invoice allocations by org', supabase.from('invoice_allocations').delete().eq('organization_id', orgId));
  await maybe('delete invoice line items by org', supabase.from('invoice_line_items').delete().eq('organization_id', orgId));
  await maybe('delete invoices', supabase.from('invoices').delete().eq('organization_id', orgId));
  await maybe('delete budget targets', supabase.from('budget_targets').delete().eq('organization_id', orgId));
  await maybe('delete inventory movements', supabase.from('inventory_movements').delete().eq('organization_id', orgId));
  await maybe('delete waste logs', supabase.from('wastage_logs').delete().eq('organization_id', orgId));
  await maybe('delete count sessions', supabase.from('count_sessions').delete().eq('organization_id', orgId));
  await maybe('delete recipes', supabase.from('recipes').delete().eq('organization_id', orgId));
  await maybe('delete inventory', supabase.from('inventory').delete().eq('organization_id', orgId));
  await maybe('delete products', supabase.from('products').delete().eq('organization_id', orgId));
  await maybe('delete vendors', supabase.from('vendors').delete().eq('organization_id', orgId));
}

async function seedVendors(context) {
  const vendorTemplates = [
    { name: 'Performance Demo Foods', category: 'Proteins', health: 94, spend: 128500, unpaid: 8400 },
    { name: 'Regional Demo Supply', category: 'Dry Goods', health: 88, spend: 91200, unpaid: 6200 },
    { name: 'Prime Coast Provisions', category: 'Dairy', health: 81, spend: 104900, unpaid: 9800 },
    { name: 'Freshline Distribution', category: 'Produce', health: 90, spend: 76750, unpaid: 4100 },
  ];

  for (const [brandIndex, brand] of context.brands.entries()) {
    for (const [locationIndex, location] of context.locationsByBrand[brandIndex].entries()) {
      for (const [vendorIndex, vendor] of vendorTemplates.entries()) {
        await must(`vendor ${location.name} ${vendor.name}`, supabase
          .from('vendors')
          .insert({
            accounting_vendor_id: `DEMO-V-${brandIndex + 1}${locationIndex + 1}${vendorIndex + 1}`,
            accounting_vendor_name: vendor.name,
            autopay_enabled: vendorIndex % 2 === 0,
            brand_id: brand.brand_id,
            credit_balance: vendorIndex === 2 ? 350 : 0,
            default_expense_category: vendor.category,
            default_payment_method: vendorIndex % 2 === 0 ? 'stripe' : 'check',
            email: `ap+${vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@demo-vendor.test`,
            file_routing_preference: 'storage',
            health_score: vendor.health - locationIndex,
            location_id: location.id,
            name: vendor.name,
            organization_id: context.org.id,
            status: 'active',
            total_spent: vendor.spend + brandIndex * 4500 + locationIndex * 1200,
            unpaid_ap: vendor.unpaid + locationIndex * 450,
          })
          .select('id')
          .single());
      }
    }
  }
}
async function seedProductsAndInventory(context, tenant) {
  const products = [];
  const inventoryRows = [];

  for (const [brandIndex, brand] of context.brands.entries()) {
    const primaryLocation = context.locationsByBrand[brandIndex][0];
    for (const [productIndex, item] of PRODUCT_CATALOG.entries()) {
      const name = `${brand.name} ${item.name}`;
      const product = await must(`product ${name}`, supabase
        .from('products')
        .upsert({
          accounting_category: item.category,
          average_price: item.baseCost,
          base_unit: item.unit,
          brand_id: brand.brand_id,
          category: item.category,
          description: `Professional demo ${item.category.toLowerCase()} product for Performance analytics.`,
          is_inventoried: true,
          latest_price: item.latestCost,
          location_id: null,
          location_specific: false,
          locations: context.locationsByBrand[brandIndex].map((location) => location.id),
          name,
          organization_id: context.org.id,
          par_level: item.par,
          price_history: [
            { date: previousMonthDate(8), price: item.baseCost, vendor: 'Performance Demo Foods' },
            { date: isoDate(-9), price: item.latestCost, vendor: 'Performance Demo Foods' },
          ],
          product_id: `DEMO-${tenant.emailPrefix.toUpperCase()}-${brandIndex + 1}-${productIndex + 1}`,
          reorder_point: item.reorder,
          report_by_unit: item.unit,
          status: 'active',
          vendor_name: productIndex % 2 === 0 ? 'Performance Demo Foods' : 'Regional Demo Supply',
        }, { onConflict: 'organization_id,name' })
        .select('id, name, category, brand_id')
        .single());
      products.push({ ...product, ...item, brandIndex });

      for (const [locationIndex, location] of context.locationsByBrand[brandIndex].entries()) {
        const qty = Math.max(2, Math.round(item.par * (0.35 + ((brandIndex + locationIndex + productIndex) % 5) * 0.14)));
        const inventory = await must(`inventory ${name} ${location.name}`, supabase
          .from('inventory')
          .insert({
            accounting_category: item.category,
            brand_id: brand.brand_id,
            category: item.category,
            current_quantity: qty,
            current_unit: item.unit,
            current_value: Number((qty * item.latestCost).toFixed(2)),
            internal_product_id: product.id,
            last_counted_date: isoDate(-2 - locationIndex),
            location: location.name,
            location_id: location.id,
            organization_id: context.org.id,
            par_level: item.par,
            previous_quantity: Math.round(qty * 1.12),
            previous_value: Number((qty * 1.12 * item.baseCost).toFixed(2)),
            product_id: product.product_id || `DEMO-${product.id}`,
            product_name: name,
            reorder_point: item.reorder,
            unit_cost: item.latestCost,
          })
          .select('id, product_name, location_id, current_quantity, current_unit')
          .single());
        inventoryRows.push({ ...inventory, product, item, brand, location });
      }
    }
  }

  return { products, inventoryRows };
}

async function seedBudgets(context) {
  const baseBudgets = {
    Dairy: 6200,
    Produce: 5400,
    Proteins: 12400,
    'Dry Goods': 4700,
    Packaging: 3100,
    Beverages: 3800,
  };
  for (const [brandIndex, brand] of context.brands.entries()) {
    for (const [locationIndex, location] of context.locationsByBrand[brandIndex].entries()) {
      for (const [categoryIndex, category] of CATEGORIES.entries()) {
        const target = Math.round(baseBudgets[category] * (0.82 + brandIndex * 0.08 + locationIndex * 0.04 + categoryIndex * 0.015));
        await must(`budget ${location.name} ${category}`, supabase
          .from('budget_targets')
          .insert({
            brand_id: brand.brand_id,
            category,
            location_id: location.id,
            organization_id: context.org.id,
            period_start: startOfMonth(),
            period_end: endOfMonth(),
            target_amount: target,
            target_percent: null,
          })
          .select('id')
          .single());
      }
    }
  }
}

async function seedInvoicesPayments(context, tenant, productsByBrand) {
  const vendors = ['Performance Demo Foods', 'Regional Demo Supply', 'Prime Coast Provisions', 'Freshline Distribution'];
  let invoiceCounter = 1000;

  for (const [brandIndex, brand] of context.brands.entries()) {
    const brandProducts = productsByBrand.filter((product) => product.brandIndex === brandIndex);
    for (const [locationIndex, location] of context.locationsByBrand[brandIndex].entries()) {
      for (let invoiceIndex = 0; invoiceIndex < 5; invoiceIndex += 1) {
        const isPrevious = invoiceIndex === 0;
        const invoiceDate = isPrevious ? previousMonthDate(10 + locationIndex) : isoDate(-2 - invoiceIndex * 4 - locationIndex);
        const selected = brandProducts.slice(invoiceIndex, invoiceIndex + 5);
        const vendorName = vendors[(brandIndex + locationIndex + invoiceIndex) % vendors.length];
        const lineItems = selected.map((product, lineIndex) => {
          const qty = 8 + lineIndex * 3 + locationIndex + invoiceIndex;
          const unitPrice = Number((product.latestCost * (isPrevious ? 0.86 : 1 + lineIndex * 0.03)).toFixed(2));
          return {
            product,
            item_name: product.name,
            quantity: qty,
            unit_price: unitPrice,
            total_price: Number((qty * unitPrice).toFixed(2)),
            vendor_unit: product.unit,
          };
        });
        const subtotal = Number(lineItems.reduce((sum, item) => sum + item.total_price, 0).toFixed(2));
        const tax = Number((subtotal * 0.0625).toFixed(2));
        const total = Number((subtotal + tax + 18).toFixed(2));
        const paymentStatus = invoiceIndex % 4 === 0 ? 'paid' : invoiceIndex % 4 === 1 ? 'partial' : 'unpaid';
        const invoice = await must(`invoice ${location.name} ${invoiceIndex}`, supabase
          .from('invoices')
          .insert({
            account_number: `DEMO-${tenant.emailPrefix.toUpperCase()}-${brandIndex + 1}${locationIndex + 1}`,
            brand_id: brand.brand_id,
            currency: 'USD',
            delivery_fee: 18,
            due_date: isoDate(14 + invoiceIndex),
            invoice_date: invoiceDate,
            invoice_number: `${tenant.emailPrefix.toUpperCase()}-${invoiceCounter++}`,
            line_items: lineItems.map(({ product: _product, ...item }) => item),
            location: location.name,
            location_id: location.id,
            organization_id: context.org.id,
            tenant_id: context.org.tenant_id || context.tenant?.id || null,
            paid_amount: 0,
            payment_status: 'unpaid',
            raw_text: 'Performance professional demo invoice. Generated seed data.',
            source: 'performance_demo_seed',
            status: 'pending_review',
            ap_status: 'processing',
            subtotal,
            tax_amount: tax,
            total_amount: total,
            validation_results: demoMeta(context.org.slug, 'invoice'),
            vendor_name: vendorName,
          })
          .select('id, invoice_number, total_amount')
          .single());

        for (const item of lineItems) {
          await must(`line item ${invoice.invoice_number} ${item.item_name}`, supabase
            .from('invoice_line_items')
            .insert({
              internal_product_id: item.product.id,
              invoice_id: invoice.id,
              item_name: item.item_name,
              organization_id: context.org.id,
              price_variance_flag: item.unit_price > item.product.baseCost * 1.1,
              price_variance_percent: Number((((item.unit_price - item.product.baseCost) / item.product.baseCost) * 100).toFixed(2)),
              quantity: item.quantity,
              total_price: item.total_price,
              unit_price: item.unit_price,
              vendor_item_code: `${item.product.category.slice(0, 3).toUpperCase()}-${Math.round(item.product.latestCost * 100)}`,
              vendor_unit: item.vendor_unit,
            })
            .select('id')
            .single());
        }

        const spendByCategory = new Map();
        for (const item of lineItems) {
          spendByCategory.set(item.product.category, Number(((spendByCategory.get(item.product.category) || 0) + item.total_price).toFixed(2)));
        }
        for (const [category, amount] of spendByCategory.entries()) {
          await must(`allocation ${invoice.invoice_number} ${category}`, supabase
            .from('invoice_allocations')
            .insert({
              allocation_type: 'category',
              amount,
              category_name: category,
              gl_code: `DEMO-${category.toUpperCase().replace(/\s+/g, '-')}`,
              invoice_id: invoice.id,
              location_id: location.id,
              organization_id: context.org.id,
              percentage: Number(((amount / subtotal) * 100).toFixed(2)),
            })
            .select('id')
            .single());
        }

        await must(`finalize invoice ${invoice.invoice_number}`, supabase
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

        if (!isPrevious) {
          await must(`payment ${invoice.invoice_number}`, supabase
            .from('payments')
            .insert({
              amount: paymentStatus === 'paid' ? total : paymentStatus === 'partial' ? Number((total * 0.45).toFixed(2)) : Number((total * 0.25).toFixed(2)),
              brand_id: brand.brand_id,
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              location_id: location.id,
              notes: 'Performance demo payment exposure seed.',
              organization_id: context.org.id,
              tenant_id: context.org.tenant_id || context.tenant?.id || null,
              payment_date: isoDate(-1 - invoiceIndex),
              payment_method: invoiceIndex % 3 === 0 ? 'ach' : 'card',
              status: paymentStatus === 'paid' || paymentStatus === 'partial' ? 'completed' : 'pending',
              transaction_id: `DEMO-PAY-${invoice.invoice_number}`,
              vendor_name: vendorName,
            })
            .select('id')
            .single());
        }
      }
    }
  }
}

async function seedInventoryActivity(context, inventoryRows, ownerUserId) {
  const grouped = new Map();
  for (const row of inventoryRows) {
    const key = row.location_id;
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  for (const rows of grouped.values()) {
    const countedData = {};
    for (const row of rows.slice(0, 8)) {
      countedData[row.id] = {
        quantity: Math.max(1, Math.round(Number(row.current_quantity || 0) * 0.94)),
        unit: row.current_unit,
        product_name: row.product_name,
      };
    }
    await maybe('count session', supabase.from('count_sessions').insert({
      completed_at: `${isoDate(-2)}T21:00:00.000Z`,
      counted_by: ownerUserId,
      counted_data: countedData,
      organization_id: context.org.id,
      started_at: `${isoDate(-2)}T19:00:00.000Z`,
      status: 'completed',
      variance_data: demoMeta(context.org.slug, 'inventory_count'),
    }));
  }

  for (const [index, row] of inventoryRows.entries()) {
    if (index % 3 === 0) {
      await maybe('inventory movement receipt', supabase.from('inventory_movements').insert({
        created_by: ownerUserId,
        inventory_id: row.id,
        location_id: row.location_id,
        movement_type: 'invoice_received',
        new_quantity: Number(row.current_quantity || 0),
        organization_id: context.org.id,
        previous_quantity: Math.max(0, Number(row.current_quantity || 0) - 6),
        quantity: 6,
        source_type: 'performance_demo',
      }));
    }
    if (index % 5 === 0) {
      await maybe('inventory movement usage', supabase.from('inventory_movements').insert({
        created_by: ownerUserId,
        inventory_id: row.id,
        location_id: row.location_id,
        movement_type: 'manual_adjustment',
        new_quantity: Math.max(0, Number(row.current_quantity || 0) - 4),
        organization_id: context.org.id,
        previous_quantity: Number(row.current_quantity || 0),
        quantity: -4,
        source_type: 'performance_demo',
      }));
    }
    if (index % 11 === 0) {
      await maybe('waste log', supabase.from('wastage_logs').insert({
        brand_id: row.brand.brand_id,
        location: row.location.name,
        location_id: row.location.id,
        logged_by: ownerUserId,
        notes: 'Performance demo waste variance.',
        organization_id: context.org.id,
        product_id: row.product.id,
        product_name: row.product.name,
        quantity: 2,
        reason: 'spoiled',
        unit: row.item.unit,
        value: Number((2 * row.item.latestCost).toFixed(2)),
      }));
    }
  }
}

async function seedRecipes(context, productsByBrand) {
  const recipeTemplates = [
    { name: 'Signature Grain Bowl', category: 'Entree', target: 38, price: 16, costMultiplier: 1.0 },
    { name: 'Herb Chicken Plate', category: 'Entree', target: 35, price: 19, costMultiplier: 1.18 },
    { name: 'Salmon Market Salad', category: 'Entree', target: 42, price: 24, costMultiplier: 1.35 },
    { name: 'Cold Brew Cream Service', category: 'Beverage', target: 48, price: 8, costMultiplier: 0.85 },
  ];

  for (const [brandIndex, brand] of context.brands.entries()) {
    const brandProducts = productsByBrand.filter((product) => product.brandIndex === brandIndex);
    const location = context.locationsByBrand[brandIndex][0];
    for (const [recipeIndex, template] of recipeTemplates.entries()) {
      const ingredients = brandProducts.slice(recipeIndex, recipeIndex + 4).map((product, ingredientIndex) => ({
        product_id: product.id,
        product_name: product.name,
        quantity: Number((0.4 + ingredientIndex * 0.25).toFixed(2)),
        unit: product.unit,
        unit_cost: product.latestCost,
      }));
      const ingredientCost = Number((ingredients.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0) * template.costMultiplier).toFixed(2));
      const packagingCost = recipeIndex % 2 === 0 ? 0.85 : 0.35;
      const totalCost = Number((ingredientCost + packagingCost + 1.15).toFixed(2));
      await must(`recipe ${brand.name} ${template.name}`, supabase
        .from('recipes')
        .insert({
          brand_id: brand.brand_id,
          category: template.category,
          cook_time_minutes: 12 + recipeIndex * 3,
          cost_per_serving: totalCost,
          description: 'Performance demo recipe connected to product cost signals.',
          ingredients,
          instructions: ['Prep ingredients', 'Cook to standard', 'Plate and verify margin'],
          is_batch: false,
          labor_cost: 1.15,
          labor_rate_per_hour: 22,
          labor_time_minutes: 3,
          location_id: location.id,
          margin_alert_enabled: true,
          name: `${brand.name} ${template.name}`,
          organization_id: context.org.id,
          packaging_items: [{ name: 'Demo packaging', cost: packagingCost }],
          prep_time_minutes: 8,
          selling_price: template.price,
          status: 'active',
          suggested_price: Number((totalCost / (1 - template.target / 100)).toFixed(2)),
          target_margin_percent: template.target,
          total_cost: totalCost,
          total_ingredient_cost: ingredientCost,
          total_packaging_cost: packagingCost,
          yield_percentage: 100,
          yield_quantity: 1,
          yield_unit: 'serving',
        })
        .select('id')
        .single());
    }
  }
}

const contexts = [];
const credentials = [];

for (const tenant of demoTenants) {
  const context = await seedHierarchy(tenant);
  contexts.push({ tenant, context });

  const accounts = accountsForTenant(tenant, context);
  let firstAdminUser = null;
  for (const account of accounts) {
    const user = await upsertUser(account, {
      organizationId: account.organizationId,
      tenantId: context.tenant?.id || context.org.tenant_id || null,
      brandId: account.brandId,
      locationId: account.locationId,
    });
    if (!firstAdminUser && account.role === 'tenant_super_admin') firstAdminUser = user;
    await seedProfile(account, user, {
      organizationId: account.organizationId,
      tenantId: context.tenant?.id || context.org.tenant_id || null,
      brandId: account.brandId,
      locationId: account.locationId,
    });
    credentials.push({ email: account.email, name: account.fullName, role: account.role, organization: context.org.name });
  }

  if (firstAdminUser) {
    await maybe(`set owner ${context.org.slug}`, supabase.from('organizations').update({ owner_id: firstAdminUser.id }).eq('id', context.org.id));
  }
}

for (const { tenant, context } of contexts) {
  const tenantAdmin = await findUserByEmail(`${EMAIL_NAMESPACE}.${tenant.emailPrefix}.tenant@restops.test`);
  await clearDemoData(context.org.id);
  await seedVendors(context);
  const { products, inventoryRows } = await seedProductsAndInventory(context, tenant);
  await seedBudgets(context);
  await seedInvoicesPayments(context, tenant, products);
  await seedInventoryActivity(context, inventoryRows, tenantAdmin?.id || null);
  await seedRecipes(context, products);
}

console.log('\nPerformance professional demo seed complete.\n');
console.table(credentials);
console.log('Shared password: configured from PERFORMANCE_DEMO_PASSWORD.');
console.log('Organizations:', contexts.map(({ context }) => context.org.name).join(' | '));
