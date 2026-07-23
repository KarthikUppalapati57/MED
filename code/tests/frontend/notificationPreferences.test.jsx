import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNotificationModuleKey } from '../../src/modules/dashboard/pages/Notifications.jsx';

const insertSpy = vi.fn();
let preferenceRows = [];
let preferenceError = null;

function preferenceBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: preferenceRows, error: preferenceError }),
  };
}

function notificationBuilder() {
  return {
    insert: insertSpy,
  };
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'notification_delivery_preferences') return preferenceBuilder();
      if (table === 'notifications') return notificationBuilder();
      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

describe('notification module settings', () => {
  beforeEach(() => {
    insertSpy.mockReset();
    insertSpy.mockResolvedValue({ error: null });
    preferenceRows = [];
    preferenceError = null;
  });

  it('uses metadata.module_key for module tabs before falling back to type', () => {
    expect(resolveNotificationModuleKey({ type: 'system', metadata: { module_key: 'payments' } })).toBe('payments');
    expect(resolveNotificationModuleKey({ type: 'low_inventory', metadata: {} })).toBe('inventory');
    expect(resolveNotificationModuleKey({ type: 'system', metadata: { module_key: 'unknown' } })).toBe('system');
  });

  it('does not insert an in-app notification when the module is disabled', async () => {
    const { createNotification } = await import('../../src/lib/notificationService.js');
    preferenceRows = [{ user_id: 'user-1', module_key: 'payments', in_app_enabled: false, critical_only: false }];

    const result = await createNotification({
      user_id: 'user-1',
      organization_id: 'org-1',
      type: 'payment',
      title: 'Payment update',
      message: 'A payment changed.',
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('honors priority-only settings for critical notifications', async () => {
    const { createNotification } = await import('../../src/lib/notificationService.js');
    preferenceRows = [{ user_id: 'user-1', module_key: 'payments', in_app_enabled: true, critical_only: true }];

    await expect(createNotification({
      user_id: 'user-1',
      organization_id: 'org-1',
      type: 'payment',
      title: 'Payment update',
      message: 'A normal payment changed.',
    })).resolves.toEqual({ success: true, skipped: true });

    await expect(createNotification({
      user_id: 'user-1',
      organization_id: 'org-1',
      type: 'payment_failed',
      title: 'Payment failed',
      message: 'A critical payment failed.',
    })).resolves.toEqual({ success: true });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      organization_id: 'org-1',
      type: 'payment_failed',
      metadata: expect.objectContaining({ module_key: 'payments' }),
      is_read: false,
    }));
  });
});