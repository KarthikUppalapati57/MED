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

function projectSelectedColumns(rows, select = '*') {
  if (!rows || select === '*') return rows;
  if (typeof select !== 'string' || select.includes('(')) return rows;

  const columns = select
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);

  if (columns.length === 0) return rows;

  const projectRow = (row) => {
    if (!row || typeof row !== 'object') return row;
    return columns.reduce((projected, column) => {
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        projected[column] = row[column];
      }
      return projected;
    }, {});
  };

  return Array.isArray(rows) ? rows.map(projectRow) : projectRow(rows);
}

const createEntityClient = (table, useSoftDelete = false) => ({
  get: async (id) => {
    let query = supabase.from(table).select('*').eq('id', id);
    if (useSoftDelete) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  },
  list: async (orderBy, options = {}) => {
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
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  update: async (id, payload) => {
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
  financial: {
    saveInvoice: async ({ invoiceId = null, invoice = {}, lineItems = [] }) => {
      const { data, error } = await supabase.rpc('save_invoice_workflow', {
        p_invoice_id: invoiceId,
        p_invoice: invoice,
        p_line_items: lineItems,
      });
      if (error) throw error;
      return data;
    },
    softDeleteInvoice: async (invoiceId) => {
      const { data, error } = await supabase.rpc('soft_delete_invoice_workflow', {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      return data;
    },
    saveInvoiceAllocationSplits: async ({ originalAllocationId, splits }) => {
      const { data, error } = await supabase.rpc('save_invoice_allocation_splits', {
        p_original_allocation_id: originalAllocationId,
        p_splits: splits,
      });
      if (error) throw error;
      return data;
    },
    createPaymentAccount: async (account) => {
      const { data, error } = await supabase.rpc('create_payment_account_workflow', {
        p_account: account,
      });
      if (error) throw error;
      return data;
    },
    deactivatePaymentAccount: async (paymentAccountId) => {
      const { data, error } = await supabase.rpc('deactivate_payment_account_workflow', {
        p_payment_account_id: paymentAccountId,
      });
      if (error) throw error;
      return data;
    },
    requestInvoiceCredit: async ({ invoiceId, amount, reason, photoUrl = null }) => {
      const { data, error } = await supabase.rpc('request_invoice_credit_workflow', {
        p_invoice_id: invoiceId,
        p_requested_amount: Number(amount),
        p_reason: reason,
        p_photo_url: photoUrl,
      });
      if (error) throw error;
      return data;
    },
    recordAdHocVendorPayment: async ({ vendorId, amount, paymentMethod, memo = null, idempotencyKey = null }) => {
      const { data, error } = await supabase.rpc('record_ad_hoc_vendor_payment', {
        p_vendor_id: vendorId,
        p_amount: Number(amount),
        p_payment_method: paymentMethod,
        p_memo: memo,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    ensureLedgerBill: async ({ invoiceId, status = 'pending' }) => {
      const { data, error } = await supabase.rpc('ensure_ledger_bill_workflow', {
        p_invoice_id: invoiceId,
        p_status: status,
      });
      if (error) throw error;
      return data;
    },
    confirmPayment: async (paymentId) => {
      const { data, error } = await supabase.rpc('confirm_payment_workflow', {
        p_payment_id: paymentId,
      });
      if (error) throw error;
      return data;
    },
  },
  tenant: {
    listVendorStatements: async (organizationId) => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('vendor_statements')
        .select('*, vendor_statement_lines(*)')
        .eq('organization_id', organizationId)
        .order('statement_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    listWebhookDeliveryLogs: async (organizationId, limit = 100) => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('webhook_delivery_logs')
        .select('*, webhook_events_queue(*), webhook_endpoints(*)')
        .eq('webhook_endpoints.organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  },
  onboarding: {
    getState: async () => {
      const { data, error } = await supabase.rpc('get_my_onboarding_state');
      if (error) throw error;
      return data;
    },
    submitBusinessVerification: async (payload) => {
      const { data, error } = await supabase.rpc('submit_business_verification', {
        p_payload: payload,
      });
      if (error) throw error;
      return data;
    },
    verifyPaymentMethod: async ({
      methodType,
      provider = 'stripe',
      providerPaymentMethodId = null,
      last4 = null,
      brand = null,
      bankName = null,
      metadata = {},
    }) => {
      const { data, error } = await supabase.rpc('verify_onboarding_payment_method', {
        p_method_type: methodType,
        p_provider: provider,
        p_provider_payment_method_id: providerPaymentMethodId,
        p_last4: last4,
        p_brand: brand,
        p_bank_name: bankName,
        p_metadata: metadata,
      });
      if (error) throw error;
      return data;
    },
    applyCoupon: async ({ code, planId = null }) => {
      const { data, error } = await supabase.rpc('apply_onboarding_coupon', {
        p_code: code,
        p_plan_id: planId,
      });
      if (error) throw error;
      return data;
    },
    setupHierarchy: async (userId, organizations) => {
      const { data, error } = await supabase.rpc('setup_onboarding_hierarchy', {
        p_user_id: userId,
        p_hierarchy: organizations,
      });

      if (error) throw error;

      return {
        ...data,
        primaryOrganization: data?.organizations?.find((org) => org.id === data.primary_org_id) || data?.organizations?.[0],
        primaryBrand: data?.brands?.find((brand) => brand.id === data.primary_brand_id) || data?.brands?.[0],
        primaryLocation: data?.locations?.find((location) => location.id === data.primary_location_id) || data?.locations?.[0],
      };
    },
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
    executeInternalTransfer: async (orgId, fromLocationId, toLocationId, items, userId) => {
      const { data, error } = await supabase.rpc('execute_internal_transfer', {
        p_organization_id: orgId,
        p_from_location_id: fromLocationId,
        p_to_location_id: toLocationId,
        p_items: items,
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



