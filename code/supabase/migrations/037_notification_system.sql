-- Migration 037: Notification System (Phase 2)
-- Centralized system for operational and AI alerts.

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('low_inventory', 'invoice_approved', 'payment_failed', 'AI_alert', 'vendor_update', 'labor_alert', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications 
    FOR SELECT USING (user_id = auth.uid() AND organization_id = public.get_my_org());

-- System can create notifications for anyone in the org
CREATE POLICY "System can insert notifications" ON public.notifications 
    FOR INSERT WITH CHECK (organization_id = public.get_my_org());

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications" ON public.notifications 
    FOR UPDATE USING (user_id = auth.uid() AND organization_id = public.get_my_org());

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON public.notifications(organization_id);
