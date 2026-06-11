/**
 * Notification Service – Creates in-app notifications for Restops users.
 *
 * Inserts rows into the `notifications` table so that the realtime
 * subscription in Layout.jsx picks them up and badges the bell icon.
 */
import { supabase } from '@/lib/supabaseClient';

/**
 * Create a notification for a specific user.
 * @param {Object} params
 * @param {string} params.user_id       - Target user's UUID
 * @param {string} params.title         - Short notification title
 * @param {string} params.message       - Detailed notification body
 * @param {string} [params.type]        - Category: 'invoice', 'approval', 'system', etc.
 * @param {Object} [params.metadata]    - Any extra JSON metadata (e.g. invoice_id)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createNotification({ user_id, organization_id, title, message, type = 'system', metadata = {} }) {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id,
      organization_id,
      title,
      message,
      body: message,
      type,
      metadata,
      is_read: false,
      read: false,
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
export async function notifyManagers({ organization_id, title, message, type = 'invoice', metadata = {}, exclude_user_id }) {
  if (!organization_id) {
    console.warn('[NotificationService] No organization_id provided, skipping manager notification');
    return { notified: 0 };
  }

  try {
    // Fetch all managers/owners in this organization
    const { data: managers, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('organization_id', organization_id)
      .in('role', ['location_manager', 'branch_manager', 'org_owner'])
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

    // Batch insert notifications for all managers
    const normalizedType = type === 'approval' ? 'invoice' : type;
    const notifications = targets.map(m => ({
      organization_id,
      user_id: m.id,
      title,
      message,
      body: message,
      type: normalizedType,
      metadata,
      is_read: false,
      read: false,
    }));

    const { error: insertError } = await supabase.from('notifications').insert(notifications);
    if (insertError) {
      console.warn('[NotificationService] Batch insert failed:', insertError.message);
      return { notified: 0 };
    }

    return { notified: targets.length, managers: targets };
  } catch (err) {
    console.warn('[NotificationService] Exception:', err);
    return { notified: 0 };
  }
}
