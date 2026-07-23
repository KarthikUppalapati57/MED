/**
 * Notification Service Creates in-app notifications for Restops users.
 *
 * Inserts rows into the `notifications` table so that the realtime
 * subscription in Layout.jsx picks them up and badges the bell icon.
 */
import { supabase } from '@/lib/supabaseClient';

const TYPE_TO_MODULE = {
  approval: 'invoices',
  invoice: 'invoices',
  invoice_approved: 'invoices',
  payment: 'payments',
  payment_failed: 'payments',
  inventory: 'inventory',
  low_inventory: 'inventory',
  order: 'inventory',
  vendor_update: 'vendors',
  labor_alert: 'labor',
};

const CRITICAL_TYPES = new Set(['error', 'warning', 'payment_failed', 'low_inventory', 'AI_alert']);

function moduleForNotification(type, metadata = {}) {
  return metadata?.module_key || TYPE_TO_MODULE[type] || 'dashboard';
}

function isCriticalNotification(type, metadata = {}) {
  return Boolean(metadata?.critical || metadata?.priority === 'critical' || CRITICAL_TYPES.has(type));
}

async function getDeliveryPreferences(userIds, moduleKey) {
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [userIds].filter(Boolean);
  if (!ids.length || !moduleKey) return new Map();

  const { data, error } = await supabase
    .from('notification_delivery_preferences')
    .select('user_id, module_key, in_app_enabled, critical_only')
    .in('user_id', ids)
    .eq('module_key', moduleKey);

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return new Map();
    console.warn('[NotificationService] Preference lookup failed:', error.message);
    return new Map();
  }

  return new Map((data || []).map((row) => [row.user_id, row]));
}

function allowsInAppDelivery(preference, type, metadata) {
  if (!preference) return true;
  if (preference.in_app_enabled === false) return false;
  if (preference.critical_only && !isCriticalNotification(type, metadata)) return false;
  return true;
}

/**
 * Create a notification for a specific user.
 * @param {Object} params
 * @param {string} params.user_id       - Target user's UUID
 * @param {string} params.title         - Short notification title
 * @param {string} params.message       - Detailed notification body
 * @param {string} [params.type]        - Category: 'invoice', 'approval', 'system', etc.
 * @param {Object} [params.metadata]    - Any extra JSON metadata (e.g. invoice_id)
 * @returns {Promise<{success: boolean, error?: string, skipped?: boolean}>}
 */
export async function createNotification({ user_id, organization_id, title, message, type = 'system', metadata = null }) {
  try {
    const moduleKey = moduleForNotification(type, metadata);
    const preferences = await getDeliveryPreferences(user_id, moduleKey);
    if (!allowsInAppDelivery(preferences.get(user_id), type, metadata)) {
      return { success: true, skipped: true };
    }

    const { error } = await supabase.from('notifications').insert({
      user_id,
      organization_id,
      title,
      message,
      type,
      metadata: { ...(metadata || {}), module_key: moduleKey },
      is_read: false,
    });
    if (error) {
      console.warn('[NotificationService] Insert failed:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.warn('[NotificationService] Exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Notify all managers in the same organization about an event.
 * Queries profiles for users with manager-level roles in the given org.
 *
 * @param {Object} params
 * @param {string} params.organization_id - Organization UUID
 * @param {string} params.title           - Notification title
 * @param {string} params.message         - Notification body
 * @param {string} [params.type]          - Notification type
 * @param {Object} [params.metadata]      - Extra metadata
 * @param {string} [params.exclude_user_id] - User to exclude (e.g. the person who triggered the action)
 * @returns {Promise<{notified: number}>}
 */
export async function notifyManagers({ organization_id, title, message, type = 'invoice', metadata = null, exclude_user_id }) {
  if (!organization_id) {
    console.warn('[NotificationService] No organization_id provided, skipping manager notification');
    return { notified: 0 };
  }

  try {
    const { data: managers, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('organization_id', organization_id)
      .in('role', ['location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin'])
      .neq('status', 'inactive');

    if (error) {
      console.warn('[NotificationService] Failed to fetch managers:', error.message);
      return { notified: 0 };
    }

    const targets = (managers || []).filter(m => m.id !== exclude_user_id);

    if (targets.length === 0) {
      console.log('[NotificationService] No managers found to notify');
      return { notified: 0 };
    }

    const normalizedType = type === 'approval' ? 'invoice' : type;
    const moduleKey = moduleForNotification(normalizedType, metadata);
    const preferences = await getDeliveryPreferences(targets.map((target) => target.id), moduleKey);
    const notifications = targets
      .filter((target) => allowsInAppDelivery(preferences.get(target.id), normalizedType, metadata))
      .map(m => ({
        organization_id,
        user_id: m.id,
        title,
        message,
        type: normalizedType,
        metadata: { ...(metadata || {}), module_key: moduleKey },
        is_read: false,
      }));

    if (notifications.length === 0) return { notified: 0, managers: [] };

    const { error: insertError } = await supabase.from('notifications').insert(notifications);
    if (insertError) {
      console.warn('[NotificationService] Batch insert failed:', insertError.message);
      return { notified: 0 };
    }

    const notifiedIds = new Set(notifications.map((notification) => notification.user_id));
    return { notified: notifications.length, managers: targets.filter((target) => notifiedIds.has(target.id)) };
  } catch (err) {
    console.warn('[NotificationService] Exception:', err);
    return { notified: 0 };
  }
}
