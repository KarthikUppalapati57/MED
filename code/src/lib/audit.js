/**
 * Audit Logging Service (Lightweight)
 *
 * Provides a centralised helper for recording audit trail entries.
 * Never crashes the caller; audit failures are logged to console.
 */

import { supabase } from '@/lib/supabaseClient';

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

function normalizeAuditEntry(entry = {}) {
  return {
    entity_type: entry.entityType || entry.entity_type || entry.action || 'unknown',
    entity_id: entry.entityId || entry.entity_id || entry.target_user_id || null,
    table_name: entry.tableName || entry.table_name || entry.entityType || entry.entity_type || entry.module || 'system',
    action: entry.action || 'audit',
    module: entry.module || null,
    organization_id: entry.organization_id || entry.orgId || entry.org_id || null,
    field_changed: entry.fieldChanged || entry.field_changed || null,
    old_value: entry.oldValue != null ? String(entry.oldValue) : entry.old_value ?? null,
    new_value: entry.newValue != null ? String(entry.newValue) : entry.new_value ?? null,
    old_data: entry.oldData || entry.old_data || null,
    new_data: entry.newData || entry.new_data || null,
    user_email: entry.userEmail || entry.user_email || null,
    user_id: entry.userId || entry.user_id || null,
    details: entry.details || null,
    record_id: entry.recordId || entry.record_id || null,
  };
}

export async function logAudit(entry) {
  const payload = normalizeAuditEntry(entry);

  try {
    if (supabase) {
      const { error } = await supabase.rpc('log_audit_event', { p_entry: payload });
      if (error) throw error;
    } else {
      console.log('[audit]', payload);
    }
  } catch (err) {
    console.warn('[audit] Failed to write audit log:', err.message || err);
  }
}

export function diffForAudit(entityType, entityId, oldData, newData, meta = {}) {
  const entries = [];
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  for (const key of allKeys) {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];
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

export async function logAuditBatch(entries) {
  if (!entries || entries.length === 0) return;
  const payload = entries.map(normalizeAuditEntry);

  try {
    if (supabase) {
      const { error } = await supabase.rpc('log_audit_events', { p_entries: payload });
      if (error) throw error;
    } else {
      console.log('[audit] Batch:', payload);
    }
  } catch (err) {
    console.warn('[audit] Failed to write batch audit log:', err.message || err);
  }
}
