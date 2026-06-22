import { supabase } from '@/lib/supabaseClient';

const TABLE_SCOPE_COLUMNS = {
  accounting_sync_logs: ['organization_id'],
  ai_insights: ['organization_id'],
  auto_orders: ['organization_id', 'brand_id', 'location_id'],
  budget_targets: ['organization_id', 'brand_id', 'location_id'],
  closed_periods: ['organization_id'],
  count_sessions: ['organization_id', 'location_id'],
  count_sheets: ['organization_id', 'location_id'],
  employees: ['organization_id', 'location_id'],
  employee_shifts: ['organization_id', 'location_id'],
  gl_mappings: ['organization_id'],
  integrations: ['organization_id'],
  api_keys: ['organization_id'],
  inventory: ['organization_id', 'brand_id', 'location_id'],
  inventory_movements: ['organization_id', 'location_id'],
  invoices: ['organization_id', 'brand_id', 'location_id'],
  invoice_line_items: ['organization_id'],
  invoice_allocations: ['organization_id', 'location_id'],
  ledger_bills: ['organization_id'],
  ledger_entries: ['organization_id'],
  ledger_payments: ['organization_id'],
  operational_settings: ['organization_id', 'brand_id', 'location_id'],
  payments: ['organization_id', 'brand_id', 'location_id'],
  payment_accounts: ['organization_id'],
  pos_items: ['organization_id', 'location_id'],
  pos_menu_mapping: ['organization_id'],
  pos_sales_data: ['organization_id', 'location_id'],
  products: ['organization_id', 'brand_id', 'location_id'],

  purchase_orders: ['organization_id', 'location_id'],
  purchase_order_items: ['organization_id'],
  receivings: ['organization_id'],
  reconciliation_variances: ['organization_id'],
  intercompany_transfers: ['organization_id'],
  receiving_items: ['organization_id'],
  recipes: ['organization_id', 'brand_id', 'location_id'],
  recipe_ingredients: ['organization_id'],
  smart_prep_plans: ['organization_id', 'brand_id', 'location_id'],
  transfers: ['organization_id'],
  vendors: ['organization_id', 'brand_id', 'location_id'],
  vendor_items: ['organization_id'],
  vendor_item_mappings: ['organization_id'],
  vendor_item_prices: ['organization_id'],
  vendor_statements: ['organization_id'],
  vendor_issues: ['organization_id'],
  wastage_logs: ['organization_id', 'brand_id', 'location_id'],
  approval_policies: ['organization_id'],
  webhook_endpoints: ['organization_id'],
  webhook_events_queue: ['organization_id'],
};

const TENANT_ROUTED_TABLES = new Set(Object.keys(TABLE_SCOPE_COLUMNS));
const TENANT_SCHEMA_ACCESS_ENABLED = import.meta.env.VITE_TENANT_SCHEMA_ACCESS_ENABLED === 'true';
const TENANT_SCHEMA_READS_ENABLED = TENANT_SCHEMA_ACCESS_ENABLED || import.meta.env.VITE_TENANT_SCHEMA_READS_ENABLED === 'true';
const TENANT_SCHEMA_WRITES_ENABLED = TENANT_SCHEMA_ACCESS_ENABLED || import.meta.env.VITE_TENANT_SCHEMA_WRITES_ENABLED === 'true';

function getCachedContextScope() {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem('restops_profile_cache');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      organization_id: parsed.organization_id || parsed.organization?.id || null,
      brand_id: parsed.brand_id || (parsed.brand?.brand_id || parsed.brand?.id) || null,
      location_id: parsed.location_id || parsed.location?.id || null,
    };
  } catch {
    return {};
  }
}

function withActiveScope(table, conditions = {}) {
  const allowedScopeColumns = TABLE_SCOPE_COLUMNS[table];
  if (!allowedScopeColumns) return conditions || {};

  const scoped = { ...(conditions || {}) };
  const currentScope = getCachedContextScope();

  if (allowedScopeColumns.includes('organization_id') && !('organization_id' in scoped) && currentScope.organization_id) {
    scoped.organization_id = currentScope.organization_id;
  }
  if (allowedScopeColumns.includes('brand_id') && !('brand_id' in scoped) && currentScope.brand_id) {
    scoped.brand_id = currentScope.brand_id;
  }
  if (allowedScopeColumns.includes('location_id') && !('location_id' in scoped) && currentScope.location_id) {
    scoped.location_id = currentScope.location_id;
  }

  return scoped;
}

function canUseTenantRead(table, options = {}) {
  const select = options.select || '*';
  return TENANT_SCHEMA_READS_ENABLED && TENANT_ROUTED_TABLES.has(table) && select === '*';
}

async function tenantSelectRows(table, {
  conditions = {},
  gte = {},
  lte = {},
  search = null,
  searchColumn = null,
  orderBy = null,
  page,
  pageSize,
  limit,
  includeDeleted = false,
  single = false,
} = {}) {
  const scopedConditions = withActiveScope(table, conditions);
  const scopeColumns = TABLE_SCOPE_COLUMNS[table] || [];

  if (scopeColumns.includes('organization_id') && !scopedConditions.organization_id) {
    return null;
  }

  const ascending = orderBy ? !orderBy.startsWith('-') : true;
  const orderColumn = orderBy ? (ascending ? orderBy : orderBy.slice(1)) : null;
  const resolvedPageSize = page !== undefined ? (pageSize || limit || 50) : null;
  const resolvedLimit = single ? 1 : (resolvedPageSize || limit || null);
  const offset = page !== undefined ? page * resolvedPageSize : null;

  const { data, error } = await supabase.rpc('tenant_select_rows', {
    p_table_name: table,
    p_filters: scopedConditions,
    p_gte: gte || {},
    p_lte: lte || {},
    p_search_column: searchColumn || null,
    p_search: search || null,
    p_order_by: orderColumn,
    p_ascending: ascending,
    p_limit: resolvedLimit,
    p_offset: offset,
    p_include_deleted: includeDeleted,
    p_single: single,
  });

  if (error) throw error;
  return data;
}
async function tenantInsertRow(table, payload) {
  const scopedPayload = withActiveScope(table, payload);
  const scopeColumns = TABLE_SCOPE_COLUMNS[table] || [];

  if (scopeColumns.includes('organization_id') && !scopedPayload.organization_id) {
    return null;
  }

  const { data, error } = await supabase.rpc('tenant_insert_row', {
    p_table_name: table,
    p_payload: scopedPayload,
  });

  if (error) throw error;
  return data;
}

async function tenantUpdateRow(table, id, payload) {
  const scopedPayload = withActiveScope(table, payload);
  const scopeColumns = TABLE_SCOPE_COLUMNS[table] || [];

  if (scopeColumns.includes('organization_id') && !scopedPayload.organization_id) {
    return null;
  }

  const { data, error } = await supabase.rpc('tenant_update_row', {
    p_table_name: table,
    p_id: String(id),
    p_payload: scopedPayload,
  });

  if (error) throw error;
  return data;
}

async function tenantDeleteRow(table, id, useSoftDelete = false) {
  const scopedConditions = withActiveScope(table, {});
  const scopeColumns = TABLE_SCOPE_COLUMNS[table] || [];

  if (scopeColumns.includes('organization_id') && !scopedConditions.organization_id) {
    return null;
  }

  const { data, error } = await supabase.rpc('tenant_delete_row', {
    p_table_name: table,
    p_id: String(id),
    p_organization_id: scopedConditions.organization_id || null,
    p_soft_delete: useSoftDelete,
  });

  if (error) throw error;
  return Boolean(data);
}

function canUseTenantWrite(table) {
  return TENANT_SCHEMA_WRITES_ENABLED && TENANT_ROUTED_TABLES.has(table);
}

const createEntityClient = (table, useSoftDelete = false) => ({
  get: async (id) => {
    if (canUseTenantRead(table)) {
      const routed = await tenantSelectRows(table, {
        conditions: { id },
        includeDeleted: !useSoftDelete,
        single: true,
      });
      if (routed !== null) return routed;
    }
    let query = supabase.from(table).select('*').eq('id', id);
    if (useSoftDelete) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  },
  list: async (orderBy, options = {}) => {
    if (canUseTenantRead(table, options)) {
      const routed = await tenantSelectRows(table, {
        conditions: {},
        gte: options.gte,
        lte: options.lte,
        search: options.search,
        searchColumn: options.searchColumn,
        orderBy,
        page: options.page,
        pageSize: options.pageSize,
        limit: options.limit,
        includeDeleted: !useSoftDelete,
      });
      if (routed !== null) return routed ?? [];
    }
    let query = supabase.from(table).select(options.select || '*');
    if (useSoftDelete) {
      query = query.is('deleted_at', null);
    }
    
    // Add automatic tenant scoping for performance
    Object.entries(withActiveScope(table, {})).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    if (options.search && options.searchColumn) {
      query = query.ilike(options.searchColumn, `%${options.search}%`);
    }

    Object.entries(options.gte || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query = query.gte(key, value);
    });
    Object.entries(options.lte || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query = query.lte(key, value);
    });

    if (orderBy) {
      const ascending = !orderBy.startsWith('-');
      const column = ascending ? orderBy : orderBy.slice(1);
      query = query.order(column, { ascending });
    }
    if (options.page !== undefined) {
      const pageSize = options.pageSize || options.limit || 50;
      const from = options.page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    } else if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  filter: async (conditions, options = {}) => {
    if (canUseTenantRead(table, options)) {
      const routed = await tenantSelectRows(table, {
        conditions,
        gte: options.gte,
        lte: options.lte,
        search: options.search,
        searchColumn: options.searchColumn,
        orderBy: options.orderBy,
        page: options.page,
        pageSize: options.pageSize,
        limit: options.limit,
        includeDeleted: !useSoftDelete,
      });
      if (routed !== null) return routed ?? [];
    }
    let query = supabase.from(table).select(options.select || '*');
    if (useSoftDelete) {
      query = query.is('deleted_at', null);
    }
    Object.entries(withActiveScope(table, conditions)).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    if (options.search && options.searchColumn) {
      query = query.ilike(options.searchColumn, `%${options.search}%`);
    }

    Object.entries(options.gte || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query = query.gte(key, value);
    });
    Object.entries(options.lte || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query = query.lte(key, value);
    });

    if (options.orderBy) {
      const ascending = !options.orderBy.startsWith('-');
      const column = ascending ? options.orderBy : options.orderBy.slice(1);
      query = query.order(column, { ascending });
    }

    if (options.page !== undefined) {
      const pageSize = options.pageSize || options.limit || 50;
      const from = options.page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    } else if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  create: async (payload) => {
    if (canUseTenantWrite(table)) {
      const routed = await tenantInsertRow(table, payload);
      if (routed !== null) return routed;
    }
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  update: async (id, payload) => {
    if (canUseTenantWrite(table)) {
      const routed = await tenantUpdateRow(table, id, payload);
      if (routed !== null) return routed;
    }
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  delete: async (id) => {
    if (canUseTenantWrite(table)) {
      const routed = await tenantDeleteRow(table, id, useSoftDelete);
      if (routed !== null) return routed;
    }
    if (useSoftDelete) {
      const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return true;
    }
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  },
  createMany: async (payloads) => {
    if (!payloads || payloads.length === 0) return [];
    const scopedPayloads = payloads.map(p => withActiveScope(table, p));
    const { data, error } = await supabase.from(table).insert(scopedPayloads).select();
    if (error) throw error;
    return data;
  },
  deleteMany: async (ids) => {
    if (!ids || ids.length === 0) return true;
    let query = supabase.from(table);
    if (useSoftDelete) {
      query = query.update({ deleted_at: new Date().toISOString() });
    } else {
      query = query.delete();
    }
    query = query.in('id', ids);
    Object.entries(withActiveScope(table, {})).forEach(([key, value]) => {
      if (value) query = query.eq(key, value);
    });
    const { error } = await query;
    if (error) throw error;
    return true;
  },
});

export const api = {
  client: supabase,
  entities: {
    AutoOrder: createEntityClient('auto_orders'),
    Inventory: createEntityClient('inventory', true),
    Vendor: createEntityClient('vendors'),
    VendorItem: createEntityClient('vendor_items'),
    VendorItemMapping: createEntityClient('vendor_item_mappings'),
    Recipe: createEntityClient('recipes', true),
    Product: createEntityClient('products', true),
    Payment: createEntityClient('payments', true),
    PaymentAccount: createEntityClient('payment_accounts'),
    Invoice: createEntityClient('invoices', true),
    InvoiceLineItem: createEntityClient('invoice_line_items'),
    InvoiceAllocation: createEntityClient('invoice_allocations'),
    CreditRequest: createEntityClient('credit_requests'),
    WastageLog: createEntityClient('wastage_logs'),
    User: createEntityClient('profiles'),
    Notification: createEntityClient('notifications'),
    Invitation: createEntityClient('invitations'),
    Organization: createEntityClient('organizations'),
    Brand: createEntityClient('brands'),
    Location: createEntityClient('locations'),
    AuditLog: createEntityClient('audit_logs'),
    Employee: createEntityClient('employees'),
    EmployeeShift: createEntityClient('employee_shifts'),
    Integration: createEntityClient('integrations'),
    ApiKey: createEntityClient('api_keys'),
    AccountingSyncLog: createEntityClient('accounting_sync_logs'),
    OnboardingProgress: createEntityClient('onboarding_progress'),
    RecipeIngredient: createEntityClient('recipe_ingredients'),
    InventoryMovement: createEntityClient('inventory_movements'),
    PurchaseOrder: createEntityClient('purchase_orders'),
    PurchaseOrderItem: createEntityClient('purchase_order_items'),
    LedgerBill: createEntityClient('ledger_bills', true),
    LedgerPayment: createEntityClient('ledger_payments', true),
    LedgerEntry: createEntityClient('ledger_entries'),
    GeneralLedgerEntry: createEntityClient('general_ledger_entries'),
    AiInsight: createEntityClient('ai_insights'),
    EventLog: createEntityClient('event_logs'),
    DomainEvent: createEntityClient('domain_events'),
    ProcessingJob: createEntityClient('processing_jobs'),
    Role: createEntityClient('roles'),
    Permission: createEntityClient('permissions'),
    RolePermission: createEntityClient('role_permissions'),
    UserRole: createEntityClient('user_roles'),
    PosItem: createEntityClient('pos_items'),
    PosMenuMapping: createEntityClient('pos_menu_mapping'),
    PosSalesData: createEntityClient('pos_sales_data'),
    Transfer: createEntityClient('transfers'),
    IntercompanyTransfer: createEntityClient('intercompany_transfers'),
    Receiving: createEntityClient('receivings'),
    ReconciliationVariance: createEntityClient('reconciliation_variances'),
    ReceivingItem: createEntityClient('receiving_items'),
    CountSheet: createEntityClient('count_sheets'),
    CountSession: createEntityClient('count_sessions'),
    ClosedPeriod: createEntityClient('closed_periods'),
    LocationGroup: createEntityClient('location_groups'),
    GlMapping: createEntityClient('gl_mappings'),
    VendorItemPrice: createEntityClient('vendor_item_prices'),
    VendorStatement: createEntityClient('vendor_statements'),
    VendorIssue: createEntityClient('vendor_issues'),
    OperationalSetting: createEntityClient('operational_settings'),
    BudgetTarget: createEntityClient('budget_targets'),
    ApprovalPolicy: createEntityClient('approval_policies'),
    WebhookEndpoint: createEntityClient('webhook_endpoints'),
    WebhookEventQueue: createEntityClient('webhook_events_queue'),
    SmartPrepPlan: createEntityClient('smart_prep_plans'),
    MvDailySalesSummary: createEntityClient('mv_daily_sales_summary'),

  },
  tenant: {
    listVendorStatements: async (organizationId) => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc('tenant_select_vendor_statements', {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return data || [];
    },
    listWebhookDeliveryLogs: async (organizationId, limit = 100) => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc('tenant_select_webhook_delivery_logs', {
        p_organization_id: organizationId,
        p_limit: limit,
      });
      if (error) throw error;
      return data || [];
    },
  },
  onboarding: {
    setupOrgAndFirstLocation: async (userId, orgData, brandName, locationData) => {
      // Execute the entire onboarding process as a single atomic transaction.
      // If any step fails, all steps are rolled back to prevent orphaned records.
      const { data, error } = await supabase.rpc('setup_organization_full', {
        p_user_id: userId,
        p_org_name: orgData.name,
        p_org_slug: orgData.slug,
        p_brand_name: brandName,
        p_location_name: locationData.name,
        p_location_address: locationData.address
      });
      
      if (error) throw error;

      return { 
        org: { id: data.org_id, ...orgData }, 
        brand: { id: data.brand_id, name: brandName }, 
        location: { id: data.location_id, ...locationData } 
      };
    },
    acceptInvitation: async (token) => {
      const { data, error } = await supabase.rpc('accept_invitation', {
        p_token: token
      });
      if (error) throw error;
      return data;
    },
  },
  auth: {
    me: async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        throw error || new Error('Not authenticated');
      }
      return user;
    },
  },
  metrics: {
    getInventoryTotals: async (orgId, searchTerm = null, locationId = null) => {
      const { data, error } = await supabase.rpc('get_inventory_totals', {
        p_org_id: orgId,
        p_search_term: searchTerm,
        p_location_id: locationId
      });
      if (error) throw error;
      return data;
    },
    completeCountSession: async (orgId, locationId, countSheetId, counts, userId) => {
      const { data, error } = await supabase.rpc('complete_count_session', {
        p_organization_id: orgId,
        p_location_id: locationId,
        p_count_sheet_id: countSheetId,
        p_counts: counts,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
    receivePurchaseOrder: async (orgId, locationId, orderId, receivedQuantities, userId) => {
      const { data, error } = await supabase.rpc('receive_purchase_order', {
        p_organization_id: orgId,
        p_location_id: locationId,
        p_order_id: orderId,
        p_received_quantities: receivedQuantities,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
    completeInventoryTransfer: async (orgId, transferId, userId) => {
      const { data, error } = await supabase.rpc('complete_inventory_transfer', {
        p_organization_id: orgId,
        p_transfer_id: transferId,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
  },
  admin: {
    /** Securely update a user's role via server-side RPC (prevents privilege escalation) */
    updateUserRole: async ({
      targetUserId,
      newRole,
      newStatus = null,
      newDepartment = null,
      newLocation = null,
      newBrandId = null,
      newLocationId = null,
      newAccessLevel = null,
    }) => {
      const { data, error } = await supabase.rpc('admin_update_user_role', {
        target_user_id: targetUserId,
        new_role: newRole,
        new_status: newStatus,
        new_department: newDepartment,
        new_location: newLocation,
        new_brand_id: newBrandId,
        new_location_id: newLocationId,
        new_access_level: newAccessLevel,
      });
      if (error) throw error;
      return data;
    },
  },
  reports: {
    getPerformanceMetrics: async (orgId, startDate, endDate, brandId = null, locationId = null) => {
      const { data, error } = await supabase.rpc('get_performance_dashboard_metrics', {
        p_organization_id: orgId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_brand_id: brandId,
        p_location_id: locationId
      });
      if (error) throw error;
      return data;
    },
    getPnlSummary: async (orgId, startDate, endDate, brandId = null, locationId = null) => {
      const { data, error } = await supabase.rpc('get_pnl_summary', {
        p_org_id: orgId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_brand_id: brandId,
        p_location_id: locationId
      });
      if (error) throw error;
      return data;
    },
    getLaborScheduleVariance: async (startDate, endDate, locationId = null) => {
      const { data, error } = await supabase.rpc('get_labor_schedule_variance', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_location_id: locationId
      });
      if (error) throw error;
      return data;
    },
    getMenuEngineering: async (orgId, startDate = null, endDate = null) => {
      const { data, error } = await supabase.rpc('get_menu_engineering_data', {
        p_org_id: orgId,
        p_start_date: startDate,
        p_end_date: endDate
      });
      if (error) throw error;
      return data;
    },
    getThreeWayMatchStatus: async (poId) => {
      const { data, error } = await supabase.rpc('get_three_way_match_status', {
        p_purchase_order_id: poId
      });
      if (error) throw error;
      return data;
    },
    recordPaymentLedger: async (orgId, billId, sourcePaymentId, paymentMethod, amount, paymentDate, userId) => {
      const { data, error } = await supabase.rpc('record_payment_ledger', {
        p_organization_id: orgId,
        p_bill_id: billId,
        p_source_payment_id: sourcePaymentId,
        p_payment_method: paymentMethod,
        p_amount: amount,
        p_payment_date: paymentDate,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    }
  },
  vendors: {
    getFlaggedVendorItems: async (orgId) => {
      const { data, error } = await supabase.rpc('get_flagged_vendor_items', {
        p_organization_id: orgId
      });
      if (error) throw error;
      return data || [];
    },
    resolvePriceVariance: async (vendorItemId, updateProduct) => {
      const { data, error } = await supabase.rpc('resolve_price_variance', {
        p_vendor_item_id: vendorItemId,
        p_update_product: updateProduct
      });
      if (error) throw error;
      return data;
    }
  }
};
