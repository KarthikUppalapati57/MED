/**
 * Audit Logging Service (Lightweight)
 *
 * Provides a centralised helper for recording audit trail entries.
 * Adapted from CRE Financial Suite for Restops.
 * Never crashes the caller audit failures are logged to console.
 *
 * Supports per-module filtering via the `module` field.
 * Valid modules: 'users', 'organizations', 'inventory', 'orders',
 *   'invoices', 'payments', 'products', 'vendors', 'recipes', 'platform', 'system'
 */

import { supabase } from '@/lib/supabaseClient';

/** Standard module constants for audit log categorization */
export const AUDIT_MODULES = {
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  INVENTORY: 'inventory',
  ORDERS: 'orders',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  PRODUCTS: 'products',
  VENDORS: 'vendors',
  RECIPES: 'recipes',
  PLATFORM: 'platform',
  SYSTEM: 'system',
};

/**
 * Record an audit log entry.
 * Accepts either the CRE-style shape or a simple Restops shape.
 *
 * @param {Object} entry
 * @param {string} [entry.action]           - Action performed (e.g. "update_user_permissions")
 * @param {string} [entry.module]           - Module/page this action belongs to (e.g. "inventory", "users")
 * @param {string} [entry.target_user_id]   - ID of user being acted upon
 * @param {Object} [entry.details]          - Additional metadata
 * @param {string} [entry.entityType]       - Logical entity name
 * @param {string} [entry.entityId]         - ID of affected record
 * @param {string} [entry.orgId]            - Organisation ID
 */
export async function logAudit(entry) {
  const row = {
    entity_type:   entry.entityType || entry.action || 'unknown',
    entity_id:     entry.entityId || entry.target_user_id || null,
    action:        entry.action || 'audit',
    module:        entry.module || null,
    org_id:        entry.orgId || null,
    field_changed: entry.fieldChanged || null,
    old_value:     entry.oldValue != null ? String(entry.oldValue) : null,
    new_value:     entry.newValue != null ? String(entry.newValue) : null,
    user_email:    entry.userEmail || null,
    user_id:       entry.userId || null,
    details:       entry.details ? JSON.stringify(entry.details) : null,
    created_at:    new Date().toISOString(),
  };

  try {
    if (supabase) {
      const { error } = await supabase.from('audit_logs').insert(row);
      if (error) throw error;
    } else {
      console.log('[audit]', row);
    }
  } catch (err) {
    // Audit logging should never crash the caller
    console.warn('[audit] Failed to write audit log:', err.message || err);
  }
}

export function diffForAudit(entityType, entityId, oldData, newData, meta = {}) {
  const entries = [];
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  for (const key of allKeys) {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];
    
    // Use structural stringification comparison for objects to avoid false positive diffs
    const isDifferent = typeof oldVal === 'object' && oldVal !== null && newVal !== null
      ? JSON.stringify(oldVal) !== JSON.stringify(newVal)
      : oldVal !== newVal;

    if (isDifferent) {
      entries.push({
        entityType,
        entityId,
        action: 'update',
        fieldChanged: key,
        oldValue: oldVal,
        newValue: newVal,
        ...meta,
      });
    }
  }
  return entries;
}

/**
 * Log multiple audit entries in a single batch database insert query.
 * Reduces network operations from N parallel queries to exactly 1 query.
 * @param {Array} entries
 */
export async function logAuditBatch(entries) {
  if (!entries || entries.length === 0) return;
  const rows = entries.map(entry => ({
    entity_type:   entry.entityType || entry.action || 'unknown',
    entity_id:     entry.entityId || entry.target_user_id || null,
    action:        entry.action || 'audit',
    module:        entry.module || null,
    org_id:        entry.orgId || null,
    field_changed: entry.fieldChanged || null,
    old_value:     entry.oldValue != null ? String(entry.oldValue) : null,
    new_value:     entry.newValue != null ? String(entry.newValue) : null,
    user_email:    entry.userEmail || null,
    user_id:       entry.userId || null,
    details:       entry.details ? JSON.stringify(entry.details) : null,
    created_at:    new Date().toISOString(),
  }));

  try {
    if (supabase) {
      const { error } = await supabase.from('audit_logs').insert(rows);
      if (error) throw error;
    } else {
      console.log('[audit] Batch:', rows);
    }
  } catch (err) {
    console.warn('[audit] Failed to write batch audit log:', err.message || err);
  }
}
