import React from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

export const NOTIFICATION_CONSENT_TEXT = {
  title: 'SMS and email notification consent',
  summary: 'Enable these channels only if you want RestOps to send service-related notifications to the contact information on your account.',
  collected: 'We use your account email address and saved phone number only for the notification channels you turn on.',
  examples: 'Notifications can include invoice and payment alerts, inventory or vendor alerts, reports, approvals, reminders, and important service notices.',
  sms: 'SMS messages may use automated delivery. Message and data rates may apply. Message frequency depends on your account activity.',
  optOut: 'You can turn these settings off at any time. SMS recipients can also reply STOP to unsubscribe or HELP for help.',
};

export default function NotificationConsentNotice({ className, compact = false }) {
  return (
    <div className={cn('rounded-md border border-primary/20 bg-primary/5 p-4 text-sm', className)}>
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-foreground">{NOTIFICATION_CONSENT_TEXT.title}</p>
          <p className="text-muted-foreground">{NOTIFICATION_CONSENT_TEXT.summary}</p>
          <div className={cn('grid gap-2 text-xs leading-5 text-muted-foreground', !compact && 'md:grid-cols-2')}>
            <p>{NOTIFICATION_CONSENT_TEXT.collected}</p>
            <p>{NOTIFICATION_CONSENT_TEXT.examples}</p>
            <p>{NOTIFICATION_CONSENT_TEXT.sms}</p>
            <p>{NOTIFICATION_CONSENT_TEXT.optOut}</p>
          </div>
        </div>
      </div>
    </div>
  );
}