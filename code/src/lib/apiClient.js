import { supabase } from '@/lib/supabaseClient';

const createEntityClient = (table, useSoftDelete = false) => ({
  list: async (orderBy, options = {}) => {
    let query = supabase.from(table).select('*');
    if (orderBy) {
      const ascending = !orderBy.startsWith('-');
      const column = ascending ? orderBy : orderBy.slice(1);
      query = query.order(column, { ascending });
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  filter: async (conditions) => {
    let query = supabase.from(table).select('*');
    Object.entries(conditions || {}).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
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
});

export const api = {
  entities: {
    AutoOrder: createEntityClient('auto_orders'),
    Inventory: createEntityClient('inventory', true),
    Vendor: createEntityClient('vendors'),
    Recipe: createEntityClient('recipes', true),
    Product: createEntityClient('products', true),
    Payment: createEntityClient('payments', true),
    Invoice: createEntityClient('invoices', true),
    InvoiceLineItem: createEntityClient('invoice_line_items'),
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
    AccountingSyncLog: createEntityClient('accounting_sync_logs'),
    OnboardingProgress: createEntityClient('onboarding_progress'),
    RecipeIngredient: createEntityClient('recipe_ingredients'),
    InventoryMovement: createEntityClient('inventory_movements'),
    PurchaseOrder: createEntityClient('purchase_orders'),
    PurchaseOrderItem: createEntityClient('purchase_order_items'),
    LedgerBill: createEntityClient('ledger_bills', true),
    LedgerPayment: createEntityClient('ledger_payments', true),
    LedgerEntry: createEntityClient('ledger_entries'),
    AiInsight: createEntityClient('ai_insights'),
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
    Receiving: createEntityClient('receivings'),
    CountSheet: createEntityClient('count_sheets'),
    CountSession: createEntityClient('count_sessions'),
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
  admin: {
    /** Securely update a user's role via server-side RPC (prevents privilege escalation) */
    updateUserRole: async ({
      targetUserId,
      newRole,
      newStatus = null,
      newDepartment = null,
      newLocation = null,
      newPermissions = null,
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
        new_permissions: newPermissions,
        new_brand_id: newBrandId,
        new_location_id: newLocationId,
        new_access_level: newAccessLevel,
      });
      if (error) throw error;
      return data;
    },
  },
  reports: {
    getMenuEngineering: async (orgId, startDate = null, endDate = null) => {
      const { data, error } = await supabase.rpc('get_menu_engineering_data', {
        p_org_id: orgId,
        p_start_date: startDate,
        p_end_date: endDate
      });
      if (error) throw error;
      return data;
    }
  }
};

