import { supabase } from '@/lib/supabaseClient';

function normalizeOtpEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOtpPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(value || '').trim();
}

function getOnboardingOtpRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/business-verification`;
}

const TABLE_SCOPE_COLUMNS = {
  accounting_sync_logs: ['organization_id'],
  ai_insights: ['organization_id'],
  auto_orders: ['organization_id', 'brand_id', 'location_id'],
  budget_targets: ['organization_id', 'brand_id', 'location_id'],
  closed_periods: ['organization_id'],
  count_sessions: ['organization_id'],
  count_sheets: ['organization_id', 'location_id'],
  customers: ['organization_id'],
  employees: ['organization_id', 'location_id'],
  employee_shifts: ['organization_id', 'location_id'],
  loyalty_memberships: ['organization_id'],
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
  organization_vendor_defaults: ['organization_id'],
  payments: ['organization_id', 'brand_id', 'location_id'],
  payment_accounts: ['organization_id'],
  pos_items: ['organization_id', 'location_id'],
  pos_menu_mapping: ['organization_id'],
  pos_sales_data: ['organization_id', 'location_id'],
  products: ['organization_id', 'brand_id', 'location_id'],
  product_count_units: ['organization_id', 'brand_id', 'location_id'],

  purchase_orders: ['organization_id', 'location_id'],
  purchase_order_items: ['organization_id'],
  receivings: ['organization_id'],
  reconciliation_variances: ['organization_id'],
  intercompany_transfers: ['organization_id'],
  receiving_items: ['organization_id'],
  recipes: ['organization_id', 'brand_id', 'location_id'],
  recipe_ingredients: ['organization_id'],
  recipe_types: ['organization_id', 'location_id'],
  recipe_yields: ['organization_id'],
  recipe_unit_conversions: ['organization_id'],
  recipe_location_visibility: ['organization_id'],
  recipe_margin_alert_events: ['organization_id'],
  recipe_equipment_catalog: ['organization_id'],
  recipe_equipment_assignments: ['organization_id'],
  recipe_preparation_steps: ['organization_id'],
  recipe_location_prices: ['organization_id'],
  recipe_categories: ['organization_id'],
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

const createEntityClient = (table, useSoftDelete = false, defaultSelect = '*') => ({
  get: async (id) => {
    let query = supabase.from(table).select(defaultSelect).eq('id', id);
    if (useSoftDelete) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  },
  list: async (orderBy, options = {}) => {
    let query = supabase.from(table).select(options.select || defaultSelect);
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
    let query = supabase.from(table).select(options.select || defaultSelect);
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
      .select(defaultSelect)
      .single();
    if (error) throw error;
    return data;
  },
  update: async (id, payload) => {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .select(defaultSelect)
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
    const { data, error } = await supabase.from(table).insert(scopedPayloads).select(defaultSelect);
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
    VendorDefaultSettings: createEntityClient('organization_vendor_defaults'),
    VendorItemMapping: createEntityClient('vendor_item_mappings'),
    Recipe: createEntityClient('recipes', true),
    Product: createEntityClient('products', true),
    Payment: createEntityClient('payments', true),
    PaymentAccount: createEntityClient('payment_accounts'),
    InvoiceReminderSettings: createEntityClient('invoice_reminder_settings'),
    Invoice: createEntityClient('invoices', true),
    InvoiceLineItem: createEntityClient('invoice_line_items'),
    InvoiceAllocation: createEntityClient('invoice_allocations'),
    CreditRequest: createEntityClient('credit_requests'),
    WastageLog: createEntityClient('wastage_logs', true),
    User: createEntityClient('profiles'),
    Notification: createEntityClient('notifications'),
    Invitation: createEntityClient('invitations'),
    Organization: createEntityClient('organizations'),
    Brand: createEntityClient('brands'),
    Location: createEntityClient('locations'),
    AuditLog: createEntityClient('audit_logs'),
    Employee: createEntityClient('employees'),
    EmployeeShift: createEntityClient('employee_shifts'),
    Integration: createEntityClient('integrations', false, 'id, organization_id, provider, is_active, connected_at, updated_at'),
    ApiKey: createEntityClient('api_keys'),
    AccountingSyncLog: createEntityClient('accounting_sync_logs'),
    OnboardingProgress: createEntityClient('onboarding_progress'),
    RecipeIngredient: createEntityClient('recipe_ingredients'),
    RecipeType: createEntityClient('recipe_types'),
    RecipeYield: createEntityClient('recipe_yields'),
    RecipeUnitConversion: createEntityClient('recipe_unit_conversions'),
    RecipeLocationVisibility: createEntityClient('recipe_location_visibility'),
    RecipeMarginAlertEvent: createEntityClient('recipe_margin_alert_events'),
    RecipeEquipmentCatalog: createEntityClient('recipe_equipment_catalog'),
    RecipeEquipmentAssignment: createEntityClient('recipe_equipment_assignments'),
    RecipePreparationStep: createEntityClient('recipe_preparation_steps'),
    RecipeLocationPrice: createEntityClient('recipe_location_prices'),
    RecipeCostSnapshot: createEntityClient('recipe_cost_snapshots'),
    RecipeCategory: createEntityClient('recipe_categories'),
    ProductCountUnit: createEntityClient('product_count_units', true),
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
    CountSession: createEntityClient('count_sessions', true),
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
    Customer: createEntityClient('customers'),
    LoyaltyMembership: createEntityClient('loyalty_memberships'),

  },
  financial: {
    registerInvoiceDocument: async ({
      storagePath,
      fileName,
      fileType = null,
      fileSize = null,
      fileHash = null,
      source = 'upload',
      invoiceId = null,
      organizationId = null,
    }) => {
      const { data, error } = await supabase.rpc('register_invoice_document', {
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_file_type: fileType,
        p_file_size: fileSize,
        p_file_hash: fileHash,
        p_source: source,
        p_invoice_id: invoiceId,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return data;
    },
    attachInvoiceDocument: async ({ documentId, invoiceId }) => {
      const { error } = await supabase.rpc('attach_invoice_document', {
        p_document_id: documentId,
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
    },
    findDuplicateInvoiceDocuments: async ({ organizationId, fileHash }) => {
      const { data, error } = await supabase.rpc('find_duplicate_invoice_documents', {
        p_organization_id: organizationId,
        p_file_hash: fileHash,
      });
      if (error) throw error;
      return data || [];
    },
    saveInvoice: async ({ invoiceId = null, invoice = {}, lineItems = [] }) => {
      const { data, error } = await supabase.rpc('save_invoice_workflow', {
        p_invoice_id: invoiceId,
        p_invoice: invoice,
        p_line_items: lineItems,
      });
      if (error) throw error;
      return data;
    },
    startInvoiceExtraction: async (invoiceId) => {
      const { data, error } = await supabase.rpc('start_invoice_extraction_workflow', {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      return data;
    },
    hardDeleteInvoice: async (invoiceId) => {
      const { data, error } = await supabase.rpc('hard_delete_invoice_workflow', {
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
    getVerificationSettings: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_verification_settings');
      if (error) throw error;
      return data || { ein_verification_enabled: false, ssn_verification_enabled: false, usps_address_validation_enabled: false };
    },
    isBusinessNameAvailable: async (legalName) => {
      const { data, error } = await supabase.rpc('is_business_name_available', { p_legal_name: legalName });
      if (error) throw error;
      return data !== false;
    },
    updateVerificationSettings: async ({ einEnabled, ssnEnabled, uspsAddressValidationEnabled }) => {
      const { data, error } = await supabase.rpc('update_onboarding_verification_settings', {
        p_ein_enabled: einEnabled,
        p_ssn_enabled: ssnEnabled,
        p_usps_address_validation_enabled: uspsAddressValidationEnabled,
      });
      if (error) throw error;
      return data;
    },
    getBusinessVerificationDraft: async () => {
      const { data, error } = await supabase.rpc('get_my_business_verification_draft');
      if (error) throw error;
      return data || { draft: {}, current_step: 'business_information' };
    },
    saveBusinessVerificationDraft: async ({ payload, step }) => {
      const { data, error } = await supabase.rpc('save_business_verification_draft', {
        p_payload: payload,
        p_step: step,
      });
      if (error) throw error;
      return data;
    },
    requestContactOtp: async ({ channel, target }) => {
      const normalizedChannel = String(channel || '').toLowerCase();
      const normalizedTarget = normalizedChannel === 'email' ? normalizeOtpEmail(target) : normalizeOtpPhone(target);

      try {
        if (normalizedChannel === 'email') {
          const { error } = await supabase.auth.signInWithOtp({
            email: normalizedTarget,
            options: {
              shouldCreateUser: false,
              emailRedirectTo: getOnboardingOtpRedirectUrl(),
              data: {
                otp_context: 'onboarding_contact_verification',
                otp_channel: 'email',
              },
            },
          });
          if (error) throw error;
        } else if (normalizedChannel === 'phone') {
          const { error } = await supabase.auth.updateUser({ phone: normalizedTarget });
          if (error) throw error;
        } else {
          throw new Error('OTP channel must be email or phone');
        }

        return {
          success: true,
          otp_id: `supabase_auth_${normalizedChannel}`,
          channel: normalizedChannel,
          target: normalizedTarget,
        };
      } catch (authError) {
        throw new Error(
          authError?.message ||
          'Secure contact verification delivery is not configured. Configure Supabase Auth email/SMS OTP before onboarding can continue.'
        );
      }
    },
    verifyContactOtp: async ({ channel, target, code }) => {
      const normalizedChannel = String(channel || '').toLowerCase();
      const normalizedTarget = normalizedChannel === 'email' ? normalizeOtpEmail(target) : normalizeOtpPhone(target);
      const token = String(code || '').trim();

      try {
        if (normalizedChannel === 'email') {
          const { error } = await supabase.auth.verifyOtp({
            email: normalizedTarget,
            token,
            type: 'email',
          });
          if (error) throw error;
        } else if (normalizedChannel === 'phone') {
          const { error } = await supabase.auth.verifyOtp({
            phone: normalizedTarget,
            token,
            type: 'phone_change',
          });
          if (error) throw error;
        } else {
          throw new Error('OTP channel must be email or phone');
        }

        const { data, error } = await supabase.rpc('mark_onboarding_contact_verified', {
          p_channel: normalizedChannel,
          p_target: normalizedTarget,
        });
        if (error) throw error;
        return data;
      } catch (authError) {
        throw new Error(
          authError?.message ||
          'Contact verification failed. Use the OTP delivered by the configured email/SMS provider.'
        );
      }
    },
    submitBusinessVerification: async (payload) => {
      const { data, error } = await supabase.rpc('submit_business_verification', {
        p_payload: payload,
      });
      if (error) throw error;
      return data;
    },
    revealTaxIdentifier: async () => {
      const { data, error } = await supabase.rpc('reveal_my_tax_identifier');
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
    listOnboardingBankAccounts: async () => {
      const { data, error } = await supabase
        .from('onboarding_bank_accounts')
        .select('id, organization_id, brand_id, location_id, bank_name, account_holder_name, account_type, nickname, routing_number_last4, account_number_last4, billing_address_source, is_default, status, created_at')
        .neq('status', 'inactive')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    submitBankAccount: async (payload) => {
      const { data, error } = await supabase.rpc('submit_onboarding_bank_account', {
        p_payload: payload,
      });
      if (error) throw error;

      try {
        const purpose = payload.metadata?.purpose || 'vendor_funding';
        await supabase.functions.invoke('payment-bank-accounts', {
          body: {
            action: 'create_bank_account',
            payload: {
              organization_id: data?.bank_account?.organization_id || payload.organization_id || null,
              brand_id: data?.bank_account?.brand_id || payload.brand_id || null,
              location_id: data?.bank_account?.location_id || payload.location_id || null,
              purpose,
              owner_type: 'organization',
              owner_id: data?.bank_account?.organization_id || payload.organization_id || null,
              nickname: payload.nickname,
              bank_name: payload.bank_name,
              account_holder_name: payload.account_holder_name,
              account_type: payload.account_type,
              routing_number: payload.routing_number,
              account_number: payload.account_number,
              default_for_owner: payload.is_default !== false,
              source: 'complete_onboarding',
            },
          },
        });
      } catch (vaultError) {
        console.warn('Provider-neutral bank vault mirror failed:', vaultError);
      }

      return data;
    },
    setDefaultBankAccount: async (bankAccountId) => {
      const { data, error } = await supabase.rpc('set_default_onboarding_bank_account', {
        p_bank_account_id: bankAccountId,
      });
      if (error) throw error;
      return data;
    },
    capturePaymentSignature: async ({
      bankAccountId,
      signerFullName,
      signerTitle = '',
      consentVersion,
      consentText,
      signatureSha256,
      signaturePayload = {},
      signatureStoragePath = null,
      userAgent = null,
    }) => {
      const { data, error } = await supabase.rpc('capture_tenant_payment_signature', {
        p_bank_account_id: bankAccountId,
        p_signer_full_name: signerFullName,
        p_signer_title: signerTitle,
        p_consent_version: consentVersion,
        p_consent_text: consentText,
        p_signature_sha256: signatureSha256,
        p_signature_payload: signaturePayload,
        p_signature_storage_path: signatureStoragePath,
        p_user_agent: userAgent,
      });
      if (error) throw error;
      return data;
    },
    skipBankingOnboarding: async () => {
      const { data, error } = await supabase.rpc('skip_banking_onboarding');
      if (error) throw error;
      return data;
    },
    approveBusinessVerification: async ({ userId, note = null }) => {
      const { data, error } = await supabase.rpc('approve_business_verification', {
        p_user_id: userId,
        p_note: note,
      });
      if (error) throw error;
      return data;
    },
    rejectBusinessVerification: async ({ userId, reason }) => {
      const { data, error } = await supabase.rpc('reject_business_verification', {
        p_user_id: userId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    requestMoreInfo: async ({ userId, reason }) => {
      const { data, error } = await supabase.rpc('request_onboarding_more_info', {
        p_user_id: userId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    reissueOwnerInvitation: async (invitationId) => {
      const { data, error } = await supabase.rpc('reissue_owner_invitation', {
        p_invitation_id: invitationId,
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
    submitHierarchyForReview: async (userId, organizations) => {
      const { data, error } = await supabase.rpc('submit_onboarding_hierarchy_for_review', {
        p_user_id: userId,
        p_hierarchy: organizations,
      });
      if (error) throw error;
      return data;
    },
    approveHierarchy: async ({ userId, note = null }) => {
      const { data, error } = await supabase.rpc('approve_onboarding_hierarchy', {
        p_user_id: userId,
        p_note: note,
      });
      if (error) throw error;
      return data;
    },
    rejectHierarchy: async ({ userId, reason }) => {
      const { data, error } = await supabase.rpc('reject_onboarding_hierarchy', {
        p_user_id: userId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    requestHierarchyResubmit: async ({ userId, reason }) => {
      const { data, error } = await supabase.rpc('request_onboarding_hierarchy_resubmit', {
        p_user_id: userId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    getHierarchyReviewQueue: async () => {
      const { data, error } = await supabase.rpc('platform_hierarchy_review_queue');
      if (error) throw error;
      return data || [];
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
    saveInventoryCountSession: async ({
      orgId,
      locationId = null,
      brandId = null,
      countSheetId = null,
      scopeKey = 'all',
      type = 'Inventory',
      countDate,
      items = [],
      userId,
      sessionId = null
    }) => {
      const totalValue = items.reduce((sum, item) => sum + Number(item?.value || 0), 0);
      const { data, error } = await supabase.rpc('save_inventory_count_session', {
        p_organization_id: orgId,
        p_location_id: locationId,
        p_brand_id: brandId,
        p_count_sheet_id: countSheetId,
        p_scope_key: scopeKey,
        p_type: type,
        p_count_date: countDate,
        p_items: items,
        p_user_id: userId,
        p_session_id: sessionId
      });
      if (error) {
        if (!error.message?.includes('save_inventory_count_session')) throw error;

        const fullPayload = {
          organization_id: orgId,
          location_id: locationId,
          brand_id: brandId,
          count_sheet_id: countSheetId,
          scope_key: scopeKey,
          type,
          count_date: countDate,
          items,
          counted_data: items,
          total_value: totalValue,
          item_count: items.length,
          status: 'saved',
          saved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          counted_by: userId,
          created_by: userId,
        };

        if (sessionId) {
          const { data: updated, error: updateError } = await supabase
            .from('count_sessions')
            .update(fullPayload)
            .eq('id', sessionId)
            .eq('organization_id', orgId)
            .select()
            .single();
          if (!updateError) return updated;
        }

        const { data: inserted, error: insertError } = await supabase
          .from('count_sessions')
          .insert(fullPayload)
          .select()
          .single();
        if (!insertError) return inserted;

        const legacyPayload = {
          organization_id: orgId,
          count_sheet_id: countSheetId,
          status: 'in_progress',
          counted_data: items,
          counted_by: userId,
        };
        const { data: legacy, error: legacyError } = await supabase
          .from('count_sessions')
          .insert(legacyPayload)
          .select()
          .single();
        if (legacyError) throw insertError;
        return {
          ...legacy,
          location_id: locationId,
          brand_id: brandId,
          scope_key: scopeKey,
          type,
          count_date: countDate,
          items,
          total_value: totalValue,
          item_count: items.length,
          status: 'saved',
          saved_at: legacy.started_at || new Date().toISOString(),
        };
      }
      return data;
    },
    closeInventoryCountSession: async (orgId, sessionId, userId) => {
      const { data, error } = await supabase.rpc('close_inventory_count_session', {
        p_organization_id: orgId,
        p_session_id: sessionId,
        p_user_id: userId
      });
      if (error) {
        if (!error.message?.includes('close_inventory_count_session')) throw error;
        const closedAt = new Date().toISOString();
        const { data: closed, error: closeError } = await supabase
          .from('count_sessions')
          .update({ status: 'closed', closed_at: closedAt, updated_at: closedAt })
          .eq('id', sessionId)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (!closeError) return closed;
        const { data: completed, error: completeError } = await supabase
          .from('count_sessions')
          .update({ status: 'completed', completed_at: closedAt })
          .eq('id', sessionId)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (completeError) throw closeError;
        return completed;
      }
      return data;
    },
    reopenInventoryCountSession: async (orgId, sessionId, userId) => {
      const { data, error } = await supabase.rpc('reopen_inventory_count_session', {
        p_organization_id: orgId,
        p_session_id: sessionId,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
    deleteInventoryCountSession: async (orgId, sessionId, userId) => {
      const { data, error } = await supabase.rpc('delete_inventory_count_session', {
        p_organization_id: orgId,
        p_session_id: sessionId,
        p_user_id: userId
      });
      if (error) {
        if (!error.message?.includes('delete_inventory_count_session')) throw error;
        const { data: deleted, error: softDeleteError } = await supabase
          .from('count_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (!softDeleteError) return deleted;
        const { error: hardDeleteError } = await supabase
          .from('count_sessions')
          .delete()
          .eq('id', sessionId)
          .eq('organization_id', orgId);
        if (hardDeleteError) throw softDeleteError;
        return { id: sessionId, deleted: true };
      }
      return data;
    },
    logInventoryWaste: async ({
      orgId,
      brandId = null,
      locationId = null,
      inventoryId,
      productId = null,
      productName,
      quantity,
      unit,
      reason,
      notes = null,
      userId
    }) => {
      const { data, error } = await supabase.rpc('log_inventory_waste', {
        p_organization_id: orgId,
        p_brand_id: brandId,
        p_location_id: locationId,
        p_inventory_id: inventoryId,
        p_product_id: productId,
        p_product_name: productName,
        p_quantity: quantity,
        p_unit: unit,
        p_reason: reason,
        p_notes: notes,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
    deleteInventoryWaste: async (orgId, wastageLogId, userId) => {
      const { data, error } = await supabase.rpc('delete_inventory_waste', {
        p_organization_id: orgId,
        p_wastage_log_id: wastageLogId,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
    adjustInventory: async ({
      orgId,
      locationId,
      inventoryId,
      newQuantity,
      newUnit = null,
      unitCost = null,
      reason = 'manual_adjustment',
      userId = null
    }) => {
      const { data, error } = await supabase.rpc('adjust_inventory', {
        p_organization_id: orgId,
        p_location_id: locationId,
        p_inventory_id: inventoryId,
        p_new_quantity: newQuantity,
        p_new_unit: newUnit,
        p_unit_cost: unitCost,
        p_reason: reason,
        p_user_id: userId
      });
      if (error) throw error;
      return data;
    },
    fulfillIntercompanyTransfer: async (orgId, transferId, userId) => {
      const { data, error } = await supabase.rpc('fulfill_intercompany_transfer', {
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
    getCategoryPerformanceReport: async ({
      organizationId,
      locationIds = null,
      dateFrom,
      dateTo,
      comparisonDateFrom = null,
      comparisonDateTo = null,
      categoryNames = null,
      vendorIds = null,
      timezone = null,
      selectedCategory = null,
      trendCategories = null,
    }) => {
      const { data, error } = await supabase.rpc('get_category_performance_report', {
        p_organization_id: organizationId,
        p_location_ids: locationIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_comparison_date_from: comparisonDateFrom,
        p_comparison_date_to: comparisonDateTo,
        p_category_names: categoryNames,
        p_vendor_ids: vendorIds,
        p_timezone: timezone,
        p_selected_category: selectedCategory,
        p_trend_categories: trendCategories,
      });
      if (error) throw error;
      return data;
    },
    getCategoryPerformanceDrilldown: async ({
      organizationId,
      category,
      locationIds = null,
      dateFrom,
      dateTo,
      comparisonDateFrom = null,
      comparisonDateTo = null,
      vendorIds = null,
      timezone = null,
    }) => {
      const { data, error } = await supabase.rpc('get_category_performance_drilldown', {
        p_organization_id: organizationId,
        p_category: category,
        p_location_ids: locationIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_comparison_date_from: comparisonDateFrom,
        p_comparison_date_to: comparisonDateTo,
        p_vendor_ids: vendorIds,
        p_timezone: timezone,
      });
      if (error) throw error;
      return data;
    },
    getPriceMoversReport: async ({
      organizationId,
      locationIds = null,
      dateFrom,
      dateTo,
      comparisonDateFrom = null,
      comparisonDateTo = null,
      categoryNames = null,
      vendorIds = null,
      timezone = null,
      productId = null,
    }) => {
      const { data, error } = await supabase.rpc('get_price_movers_report', {
        p_organization_id: organizationId,
        p_location_ids: locationIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_comparison_date_from: comparisonDateFrom,
        p_comparison_date_to: comparisonDateTo,
        p_category_names: categoryNames,
        p_vendor_ids: vendorIds,
        p_timezone: timezone,
        p_product_id: productId,
      });
      if (error) throw error;
      return data;
    },
    getPriceMoversDrilldown: async ({
      organizationId,
      productId = null,
      productName = null,
      locationIds = null,
      dateFrom,
      dateTo,
      comparisonDateFrom = null,
      comparisonDateTo = null,
      vendorIds = null,
      timezone = null,
    }) => {
      const { data, error } = await supabase.rpc('get_price_movers_drilldown', {
        p_organization_id: organizationId,
        p_product_id: productId,
        p_product_name: productName,
        p_location_ids: locationIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_comparison_date_from: comparisonDateFrom,
        p_comparison_date_to: comparisonDateTo,
        p_vendor_ids: vendorIds,
        p_timezone: timezone,
      });
      if (error) throw error;
      return data;
    },
    getInventoryUsageReport: async ({
      organizationId,
      locationIds = null,
      dateFrom,
      dateTo,
      categoryNames = null,
      timezone = null,
    }) => {
      const { data, error } = await supabase.rpc('get_inventory_usage_report', {
        p_organization_id: organizationId,
        p_location_ids: locationIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_category_names: categoryNames,
        p_timezone: timezone,
      });
      if (error) throw error;
      return data;
    },
    getInventoryUsageDrilldown: async ({
      organizationId,
      inventoryId = null,
      productId = null,
      locationIds = null,
      dateFrom,
      dateTo,
      timezone = null,
    }) => {
      const { data, error } = await supabase.rpc('get_inventory_usage_drilldown', {
        p_organization_id: organizationId,
        p_inventory_id: inventoryId,
        p_product_id: productId,
        p_location_ids: locationIds,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_timezone: timezone,
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
  recipes: {
    saveMenuItemPhase1: async ({ recipe, yields, visibility, equipmentNames, steps, locationPrices }) => {
      const { data, error } = await supabase.rpc('save_menu_item_phase1', {
        p_recipe: recipe,
        p_yields: yields,
        p_visibility: visibility,
        p_equipment_names: equipmentNames,
        p_steps: steps,
        p_location_prices: locationPrices,
      });
      if (error) throw error;
      return data;
    },
    savePreparedItemRelease1: async ({ recipe, yields, visibility, equipmentNames, steps, ingredients }) => {
      const { data, error } = await supabase.rpc('save_prepared_item_release1', {
        p_recipe: recipe, p_yields: yields, p_visibility: visibility,
        p_equipment_names: equipmentNames, p_steps: steps, p_ingredients: ingredients,
      });
      if (error) throw error;
      return data;
    },
    getPreparedItemDependencies: async (recipeId) => {
      const { data, error } = await supabase.rpc('get_prepared_item_dependencies', { p_recipe_id: recipeId });
      if (error) throw error;
      return data || [];
    },
    deactivatePreparedItem: async (recipeId) => {
      const { data, error } = await supabase.rpc('deactivate_prepared_item', { p_recipe_id: recipeId });
      if (error) throw error;
      return data;
    },
    deletePreparedItem: async (recipeId) => {
      const { error } = await supabase.rpc('delete_prepared_item', { p_recipe_id: recipeId });
      if (error) throw error;
    },
    saveBarItemRelease1: async ({ recipe, yields, visibility, equipmentNames, steps, locationPrices }) => {
      const { data, error } = await supabase.rpc('save_bar_item_release1', {
        p_recipe: recipe, p_yields: yields, p_visibility: visibility,
        p_equipment_names: equipmentNames, p_steps: steps, p_location_prices: locationPrices,
      });
      if (error) throw error;
      return data;
    },
    setBarItemStatus: async (recipeId, status) => {
      const { data, error } = await supabase.rpc('set_bar_item_status', { p_recipe_id: recipeId, p_status: status });
      if (error) throw error;
      return data;
    },
    deleteBarItem: async (recipeId) => {
      const { error } = await supabase.rpc('delete_bar_item', { p_recipe_id: recipeId });
      if (error) throw error;
    },
    listRecipeCategories: async (organizationId = null, includeInactive = false) => {
      const { data, error } = await supabase.rpc('list_recipe_categories', {
        p_organization_id: organizationId,
        p_include_inactive: includeInactive,
      });
      if (error) throw error;
      return data || [];
    },
    createRecipeCategory: async ({ name, description = null, organizationId = null }) => {
      const { data, error } = await supabase.rpc('create_recipe_category', {
        p_name: name,
        p_description: description,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return data;
    },
    updateRecipeCategory: async ({
      categoryId,
      name,
      description = null,
      isActive = null,
      organizationId = null,
    }) => {
      const { data, error } = await supabase.rpc('update_recipe_category', {
        p_category_id: categoryId,
        p_name: name,
        p_description: description,
        p_is_active: isActive,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return data;
    },
    deleteRecipeCategory: async ({ categoryId, organizationId = null }) => {
      const { data, error } = await supabase.rpc('delete_recipe_category', {
        p_category_id: categoryId,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return data;
    },
    getRecipeCategoryCounts: async (organizationId = null) => {
      const { data, error } = await supabase.rpc('get_recipe_category_counts', {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return data || [];
    },
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
  },
  products: {
    getCatalog: async ({
      organizationId,
      brandId = null,
      locationId = null,
      search = null,
      sortBy = 'name',
      page = 0,
      pageSize = 50
    }) => {
      const { data, error } = await supabase.rpc('get_product_catalog', {
        p_organization_id: organizationId,
        p_brand_id: brandId,
        p_location_id: locationId,
        p_search: search,
        p_sort_by: sortBy,
        p_page: page,
        p_page_size: pageSize
      });
      if (error) throw error;
      return data || [];
    },
    getDashboardSummary: async ({ organizationId, brandId = null, locationId = null }) => {
      const { data, error } = await supabase.rpc('get_product_dashboard_summary', {
        p_organization_id: organizationId,
        p_brand_id: brandId,
        p_location_id: locationId
      });
      if (error) throw error;
      return data?.[0] || {
        total_products: 0,
        inventoried_count: 0,
        tax_exempt_count: 0,
        category_count: 0,
        missing_product_id_count: 0,
        uncategorized_count: 0,
        unmapped_vendor_item_count: 0,
        price_variance_count: 0
      };
    },
    getPurchaseReport: async ({
      organizationId,
      brandId = null,
      locationId = null,
      startDate = null,
      endDate = null,
      categoryType = null,
      category = null,
      search = null
    }) => {
      const { data, error } = await supabase.rpc('get_product_purchase_report', {
        p_organization_id: organizationId,
        p_brand_id: brandId,
        p_location_id: locationId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_category_type: categoryType,
        p_category: category,
        p_search: search
      });
      if (error) throw error;
      return data || [];
    },
    getVerificationQueue: async ({
      organizationId,
      brandId = null,
      locationId = null,
      status = null,
      search = null
    }) => {
      const { data, error } = await supabase.rpc('get_product_verification_queue', {
        p_organization_id: organizationId,
        p_brand_id: brandId,
        p_location_id: locationId,
        p_status: status,
        p_search: search
      });
      if (error) throw error;
      return data || [];
    },
    categorizeProducts: async ({
      organizationId,
      brandId = null,
      locationId = null,
      productIds = [],
      limit = 25,
      autoApply = true
    }) => {
      const { data, error } = await supabase.functions.invoke('categorize-products', {
        body: {
          organizationId,
          brandId,
          locationId,
          productIds,
          limit,
          autoApply
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    applyCategorySuggestion: async (productId) => {
      const { data, error } = await supabase.rpc('apply_product_category_suggestion', {
        p_product_id: productId
      });
      if (error) throw error;
      return data;
    },
    rejectCategorySuggestion: async (productId) => {
      const { data, error } = await supabase.rpc('reject_product_category_suggestion', {
        p_product_id: productId
      });
      if (error) throw error;
      return data;
    },
    createProductDetails: async (payload, { organizationId, brandId = null, locationId = null } = {}) => {
      const { data, error } = await supabase.rpc('create_product_details', {
        p_name: payload.name,
        p_restops_product_id: payload.product_id || null,
        p_description: payload.description || null,
        p_category: payload.category || null,
        p_accounting_category: payload.accounting_category || null,
        p_is_inventoried: payload.is_inventoried,
        p_is_tax_exempt: payload.is_tax_exempt,
        p_report_by_unit: payload.report_by_unit || null,
        p_base_unit: payload.base_unit || null,
        p_latest_price: payload.latest_price ?? 0,
        p_location_specific: payload.location_specific,
        p_organization_id: organizationId,
        p_brand_id: brandId,
        p_location_id: locationId
      });
      if (error) throw error;
      return data;
    },
    setInventoryTracking: async (productId, isInventoried) => {
      const { data, error } = await supabase.rpc('set_product_inventory_tracking', {
        p_product_id: productId,
        p_is_inventoried: isInventoried
      });
      if (error) throw error;
      return data;
    },
    updateProductDetails: async (productId, payload) => {
      const { data, error } = await supabase.rpc('update_product_details', {
        p_product_id: productId,
        p_name: payload.name,
        p_restops_product_id: payload.product_id || null,
        p_description: payload.description || null,
        p_category: payload.category || null,
        p_accounting_category: payload.accounting_category || null,
        p_is_inventoried: payload.is_inventoried,
        p_is_tax_exempt: payload.is_tax_exempt,
        p_report_by_unit: payload.report_by_unit || null,
        p_base_unit: payload.base_unit || null,
        p_latest_price: payload.latest_price ?? 0,
        p_location_specific: payload.location_specific,
        p_report_unit_quantity: payload.report_unit_quantity ?? null,
        p_report_unit_source_price: payload.report_unit_source_price ?? null
      });
      if (error) throw error;
      return data;
    },
    listCountUnits: async (productId) => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from('product_count_units')
        .select('*')
        .eq('product_id', productId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) {
        if (error.message?.includes('product_count_units')) return [];
        throw error;
      }
      return data || [];
    },
    listCountUnitsForProducts: async (productIds = []) => {
      const ids = [...new Set((productIds || []).filter(Boolean))];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('product_count_units')
        .select('*')
        .in('product_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) {
        if (error.message?.includes('product_count_units')) return [];
        throw error;
      }
      return data || [];
    },
    upsertCountUnit: async (payload) => {
      const { data, error } = await supabase.rpc('upsert_product_count_unit', {
        p_product_id: payload.product_id,
        p_name: payload.name,
        p_quantity: payload.quantity,
        p_unit: payload.unit,
        p_unit_price: payload.unit_price,
        p_source_quantity: payload.source_quantity,
        p_source_unit: payload.source_unit,
        p_source_price: payload.source_price,
      });
      if (error) throw error;
      return data;
    },
    removeCountUnit: async (countUnitId) => {
      const { error } = await supabase.rpc('remove_product_count_unit', {
        p_count_unit_id: countUnitId
      });
      if (error) throw error;
      return true;
    },
    deleteProduct: async (productId) => {
      const { data, error } = await supabase.rpc('soft_delete_product_safe', {
        p_product_id: productId
      });
      if (error) throw error;
      return data;
    },
    getApprovalSetting: async (organizationId) => {
      const { data, error } = await supabase.rpc('get_product_approval_setting', {
        p_organization_id: organizationId
      });
      if (error) {
        if (error.message?.includes('get_product_approval_setting')) return false;
        throw error;
      }
      return data;
    },
    setApprovalSetting: async (organizationId, enabled) => {
      const { data, error } = await supabase.rpc('set_product_approval_setting', {
        p_organization_id: organizationId,
        p_enabled: enabled
      });
      if (error) throw error;
      return data;
    },
    approveChange: async (productId) => {
      const { data, error } = await supabase.rpc('approve_product_change', {
        p_product_id: productId
      });
      if (error) throw error;
      return data;
    },
    rejectChange: async (productId, reason) => {
      const { data, error } = await supabase.rpc('reject_product_change', {
        p_product_id: productId,
        p_reason: reason || null
      });
      if (error) throw error;
      return data;
    }
  }
};

