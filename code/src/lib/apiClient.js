import { supabase } from '@/lib/supabaseClient';

const createEntityClient = (table) => ({
  list: async (orderBy) => {
    let query = supabase.from(table).select('*');
    if (orderBy) {
      const ascending = !orderBy.startsWith('-');
      const column = ascending ? orderBy : orderBy.slice(1);
      query = query.order(column, { ascending });
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
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  },
});

export const api = {
  entities: {
    AutoOrder: createEntityClient('auto_orders'),
    Inventory: createEntityClient('inventory'),
    Vendor: createEntityClient('vendors'),
    Recipe: createEntityClient('recipes'),
    Product: createEntityClient('products'),
    Payment: createEntityClient('payments'),
    Invoice: createEntityClient('invoices'),
    WastageLog: createEntityClient('wastage_logs'),
    User: createEntityClient('profiles'),
    Notification: createEntityClient('notifications'),
    Invitation: createEntityClient('invitations'),
    Organization: createEntityClient('organizations'),
    Brand: createEntityClient('brands'),
    Location: createEntityClient('locations'),
    AuditLog: createEntityClient('audit_logs'),
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
};

