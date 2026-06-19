import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run with: $env:SUPABASE_SERVICE_ROLE_KEY="..." ; node scripts/seed-role-qa-data.mjs');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const PASSWORD = process.env.ROLE_QA_PASSWORD;
if (!PASSWORD) {
  console.error('Missing ROLE_QA_PASSWORD.');
  process.exit(1);
}
const MODULES = [
  'dashboard',
  'invoices',
  'payments',
  'products',
  'inventory',
  'orders',
  'smartprep',
  'ask_tom',
  'recipes',
  'vendors',
  'labor',
  'admin',
  'integrations',
  'performance',
  'accounting',
  'setup',
];

const BASIC_MODULES = [
  'dashboard',
  'setup',
  'admin',
  'performance',
];

const tenants = [
  {
    name: 'QA Bistro Group',
    slug: 'qa-bistro-group',
    brands: [
      { name: 'North Fork Grill', locations: ['North Fork Downtown', 'North Fork Airport'] },
      { name: 'Copper Spoon', locations: ['Copper Spoon Midtown', 'Copper Spoon West'] },
    ],
  },
  {
    name: 'QA Coastal Restaurants',
    slug: 'qa-coastal-restaurants',
    brands: [
      { name: 'Harbor Table', locations: ['Harbor Table Pier', 'Harbor Table Market'] },
      { name: 'Sunset Tacos', locations: ['Sunset Tacos Beach', 'Sunset Tacos City'] },
    ],
  },
  {
    name: 'QA Basic Setup',
    slug: 'qa-basic-setup',
    modules: BASIC_MODULES,
    brands: [
      { name: 'Basic Burgers', locations: ['Basic Downtown'] },
    ],
  },
];

const staffModulePermissions = {
  AutoOrdering: 'read',
  Dashboard: 'read',
  Inventory: 'read',
  Invoices: 'full',
  Notifications: 'read',
  Products: 'read',
};

const accounts = [
  { email: 'qa.platform.admin@restops.test', fullName: 'QA Platform Admin', role: 'platform_admin', accessLevel: 'platform' },
  { email: 'qa.owner.bistro@restops.test', fullName: 'QA Bistro Owner', role: 'org_owner', tenant: 0, accessLevel: 'organization' },
  { email: 'qa.brand.northfork@restops.test', fullName: 'QA North Fork Brand Manager', role: 'branch_manager', tenant: 0, brand: 0, accessLevel: 'brand' },
  { email: 'qa.location.northfork@restops.test', fullName: 'QA North Fork Location Manager', role: 'location_manager', tenant: 0, brand: 0, location: 0, accessLevel: 'location' },
  { email: 'qa.staff.northfork@restops.test', fullName: 'QA North Fork Staff', role: 'ground_staff', tenant: 0, brand: 0, location: 0, accessLevel: 'location', permissions: staffModulePermissions },
  { email: 'qa.owner.coastal@restops.test', fullName: 'QA Coastal Owner', role: 'org_owner', tenant: 1, accessLevel: 'organization' },
  { email: 'qa.brand.harbor@restops.test', fullName: 'QA Harbor Brand Manager', role: 'branch_manager', tenant: 1, brand: 0, accessLevel: 'brand' },
  { email: 'qa.location.harbor@restops.test', fullName: 'QA Harbor Location Manager', role: 'location_manager', tenant: 1, brand: 0, location: 0, accessLevel: 'location' },
  { email: 'qa.staff.harbor@restops.test', fullName: 'QA Harbor Staff', role: 'ground_staff', tenant: 1, brand: 0, location: 0, accessLevel: 'location', permissions: staffModulePermissions },
  { email: 'qa.owner.basic@restops.test', fullName: 'QA Basic Owner', role: 'org_owner', tenant: 2, accessLevel: 'organization' },
  { email: 'qa.brand.basic@restops.test', fullName: 'QA Basic Brand Manager', role: 'branch_manager', tenant: 2, brand: 0, accessLevel: 'brand' },
  { email: 'qa.location.basic@restops.test', fullName: 'QA Basic Location Manager', role: 'location_manager', tenant: 2, brand: 0, location: 0, accessLevel: 'location' },
  { email: 'qa.staff.basic@restops.test', fullName: 'QA Basic Staff', role: 'ground_staff', tenant: 2, brand: 0, location: 0, accessLevel: 'location', permissions: staffModulePermissions },
];

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
    if (error) throw new Error(`listUsers: ${error.message}`);
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function upsertUser(account, context = {}) {
  const metadata = {
    brand_id: context.brandId || null,
    full_name: account.fullName,
    location_id: context.locationId || null,
    organization_id: context.organizationId || null,
    role: account.role,
  };
  const existing = await findUserByEmail(account.email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: metadata,
      email_confirm: true,
      password: PASSWORD,
      user_metadata: metadata,
    });
    if (error) throw new Error(`updateUser ${account.email}: ${error.message}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    app_metadata: metadata,
    email: account.email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${account.email}: ${error.message}`);
  return data.user;
}

async function seedOrganization(tenant) {
  const org = await must(`upsert org ${tenant.slug}`, supabase
    .from('organizations')
    .upsert({
      name: tenant.name,
      slug: tenant.slug,
      subscription_plan: 'enterprise',
      subscription_status: 'active',
      enabled_modules: tenant.modules || MODULES,
    }, { onConflict: 'slug' })
    .select('id, name, slug')
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
      .insert({ name: brandDef.name, organization_id: org.id })
      .select('brand_id, name')
      .single());
    brands.push(brand);

    const locations = [];
    for (const locationName of brandDef.locations) {
      const existingLocation = await must(`find location ${locationName}`, supabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', org.id)
        .eq('name', locationName)
        .maybeSingle());
      const location = existingLocation
        ? await must(`update location ${locationName}`, supabase
          .from('locations')
          .update({ address: '100 QA Test Way', brand_id: brand.brand_id, organization_id: org.id })
          .eq('id', existingLocation.id)
          .select('id, name')
          .single())
        : await must(`insert location ${locationName}`, supabase
          .from('locations')
          .insert({
            address: '100 QA Test Way',
            brand_id: brand.brand_id,
            name: locationName,
            organization_id: org.id,
          })
        .select('id, name')
        .single());
      locations.push(location);
    }
    locationsByBrand.push(locations);
  }

  return { brands, locationsByBrand, org };
}

async function seedProfile(account, user, context = {}) {
  await must(`upsert profile ${account.email}`, supabase
    .from('profiles')
    .upsert({
      access_level: account.accessLevel,
      brand_id: context.brandId || null,
      email: account.email,
      full_name: account.fullName,
      id: user.id,
      location_id: context.locationId || null,
      organization_id: context.organizationId || null,
      role: account.role,
      status: 'active',
    }, { onConflict: 'id' })
    .select('id')
    .single());

  if (context.organizationId) {
    await maybe(`organization member ${account.email}`, supabase.from('organization_members').upsert({
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

async function seedReportPreferences(userId, tenantContext) {
  const ownerRoles = ['org_owner', 'branch_manager', 'location_manager'];
  const orgPayload = {
    brand_id: null,
    created_by: userId,
    daily_handoff: true,
    include_escalations: true,
    include_forecasts: true,
    location_id: null,
    organization_id: tenantContext.org.id,
    recipient_roles: ownerRoles,
    scope: 'org',
    scope_key: 'org',
    updated_by: userId,
    weekly_executive: true,
  };
  await must(`report preferences ${tenantContext.org.slug}`, supabase
    .from('dashboard_report_preferences')
    .upsert(orgPayload, { onConflict: 'organization_id,scope,scope_key' })
    .select('id')
    .single());

  for (const [brandIndex, brand] of tenantContext.brands.entries()) {
    await must(`brand report preferences ${brand.name}`, supabase
      .from('dashboard_report_preferences')
      .upsert({
        ...orgPayload,
        brand_id: brand.brand_id,
        location_id: null,
        scope: 'brand',
        scope_key: brand.brand_id,
      }, { onConflict: 'organization_id,scope,scope_key' })
      .select('id')
      .single());

    const location = tenantContext.locationsByBrand[brandIndex][0];
    await must(`location report preferences ${location.name}`, supabase
      .from('dashboard_report_preferences')
      .upsert({
        ...orgPayload,
        brand_id: brand.brand_id,
        location_id: location.id,
        scope: 'location',
        scope_key: location.id,
      }, { onConflict: 'organization_id,scope,scope_key' })
      .select('id')
      .single());
  }
}

const tenantContexts = [];
for (const tenant of tenants) {
  tenantContexts.push(await seedOrganization(tenant));
}

const credentialRows = [];
for (const account of accounts) {
  const tenantContext = Number.isInteger(account.tenant) ? tenantContexts[account.tenant] : null;
  const brand = tenantContext && Number.isInteger(account.brand) ? tenantContext.brands[account.brand] : null;
  const location = tenantContext && Number.isInteger(account.location) ? tenantContext.locationsByBrand[account.brand][account.location] : null;
  const context = {
    brandId: brand?.brand_id || null,
    locationId: location?.id || null,
    organizationId: tenantContext?.org.id || null,
  };
  const user = await upsertUser(account, context);
  await seedProfile(account, user, context);
  credentialRows.push({
    email: account.email,
    location: location?.name || '',
    organization: tenantContext?.org.name || 'Platform',
    password: PASSWORD,
    role: account.role,
  });
}

for (const [index, tenantContext] of tenantContexts.entries()) {
  const ownerEmail = accounts.find((account) => account.tenant === index && account.role === 'org_owner')?.email;
  const owner = credentialRows.find((row) => row.email === ownerEmail);
  const ownerUser = ownerEmail ? await findUserByEmail(ownerEmail) : null;
  if (ownerUser) {
    await maybe(`set owner ${tenantContext.org.slug}`, supabase
      .from('organizations')
      .update({ owner_id: ownerUser.id })
      .eq('id', tenantContext.org.id));
    await seedReportPreferences(ownerUser.id, tenantContext);
  }
}

console.log('\nRole QA seed complete.\n');
console.table(credentialRows.map(({ password: _password, ...row }) => row));
console.log('Shared password: configured from ROLE_QA_PASSWORD.');
