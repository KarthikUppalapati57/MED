/**
 * Audit Logging Service (Lightweight)
 *
 * Provides a centralised helper for recording audit trail entries.
 * Adapted from CRE Financial Suite for MEVS.
 * Never crashes the caller — audit failures are logged to console.
 */

import { supabase } from '@/lib/supabaseClient';

/**
 * Record an audit log entry.
 * Accepts either the CRE-style shape or a simple MEVS shape.
 *
 * @param {Object} entry
 * @param {string} [entry.action]           - Action performed (e.g. "update_user_permissions")
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

/**
 * Build audit entries by diffing old and new data objects.
 * @param {string} entityType
 * @param {string} entityId
 * @param {object} oldData
 * @param {object} newData
 * @param {object} [meta]
 * @returns {Array}
 */
export function diffForAudit(entityType, entityId, oldData, newData, meta = {}) {
  const entries = [];
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  for (const key of allKeys) {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];
    if (oldVal !== newVal) {
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
 * Log multiple audit entries in parallel.
 * @param {Array} entries
 */
export async function logAuditBatch(entries) {
  await Promise.allSettled(entries.map(logAudit));
}
