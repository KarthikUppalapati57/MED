const fs = require('fs');
const path = require('path');

const root = process.cwd();
const write = (rel, text) => fs.writeFileSync(path.join(root, rel), text, 'utf8');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

write('code/src/lib/notificationActions.js', "export function getNotificationAction(notif) {\n" +
"  const metadata = notif?.metadata || {};\n" +
"  const title = String(notif?.title || '').toLowerCase();\n" +
"  const message = String(notif?.message || notif?.body || '').toLowerCase();\n\n" +
"  const isBusinessVerificationReview =\n" +
"    metadata.action === 'business_verification_review' ||\n" +
"    metadata.review_type === 'business_verification' ||\n" +
"    title.includes('business verification pending review') ||\n" +
"    message.includes('requires onboarding follow-up') ||\n" +
"    message.includes('pending platform admin review');\n\n" +
"  if (isBusinessVerificationReview) {\n" +
"    return {\n" +
"      label: 'Review Business',\n" +
"      path: '/PlatformOrganizations?review=business',\n" +
"    };\n" +
"  }\n\n" +
"  const invoiceId = metadata.invoice_id || notif?.reference_id;\n" +
"  if (invoiceId && (notif?.type === 'invoice' || notif?.type === 'approval' || notif?.type === 'invoice_approved')) {\n" +
"    return {\n" +
"      label: 'Review Invoice',\n" +
"      path: '/Invoices?invoice=' + invoiceId,\n" +
"    };\n" +
"  }\n\n" +
"  if (notif?.type === 'payment' || notif?.type === 'payment_failed') {\n" +
"    return {\n" +
"      label: 'Open Payments',\n" +
"      path: '/Payments?tab=invoices',\n" +
"    };\n" +
"  }\n\n" +
"  if (notif?.type === 'inventory' || notif?.type === 'low_inventory') {\n" +
"    return {\n" +
"      label: 'Open Inventory',\n" +
"      path: '/Inventory',\n" +
"    };\n" +
"  }\n\n" +
"  return null;\n" +
"}\n");

let layout = read('code/src/Layout.jsx');
if (!layout.includes("@/lib/notificationActions")) {
  layout = layout.replace("import RestopsLogo from '@/components/RestopsLogo';", "import RestopsLogo from '@/components/RestopsLogo';\nimport { getNotificationAction } from '@/lib/notificationActions';");
}
if (!layout.includes('const handleNotificationClick = async (notif) =>')) {
  layout = layout.replace(`  const markAllAsRead = async () => {`, `  const handleNotificationClick = async (notif) => {
    const action = getNotificationAction(notif);
    await markAsRead(notif.id);
    if (action?.path) {
      navigate(action.path);
    }
  };

  const markAllAsRead = async () => {`);
}
layout = layout.replace('onClick={() => markAsRead(notif.id)}', 'onClick={() => handleNotificationClick(notif)}');
if (!layout.includes('{getNotificationAction(notif) && (')) {
  layout = layout.replace(`                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message || notif.body}</p>`, `                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message || notif.body}</p>
                        {getNotificationAction(notif) && (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary mt-1">
                            {getNotificationAction(notif).label}
                          </p>
                        )}`);
}
write('code/src/Layout.jsx', layout);

let notifications = read('code/src/modules/dashboard/pages/Notifications.jsx');
if (!notifications.includes("@/lib/notificationActions")) {
  notifications = notifications.replace("import { cn } from \"@/lib/utils\";", "import { cn } from \"@/lib/utils\";\nimport { getNotificationAction } from '@/lib/notificationActions';");
}
const localActionStart = notifications.indexOf('  const getNotificationAction = (notif) => {');
if (localActionStart !== -1) {
  const handleStart = notifications.indexOf('  const handleOpenAction = async (notif) => {', localActionStart);
  if (handleStart !== -1) notifications = notifications.slice(0, localActionStart) + notifications.slice(handleStart);
}
write('code/src/modules/dashboard/pages/Notifications.jsx', notifications);

let platform = read('code/src/modules/platform/pages/PlatformOrganizations.jsx');
if (!platform.includes("useSearchParams")) {
  platform = platform.replace("import React, { useState } from 'react';", "import React, { useState } from 'react';\nimport { useSearchParams } from 'react-router-dom';");
}
if (!platform.includes('const [searchParams, setSearchParams] = useSearchParams();')) {
  platform = platform.replace('  const queryClient = useQueryClient();', '  const queryClient = useQueryClient();\n  const [searchParams, setSearchParams] = useSearchParams();');
}
if (!platform.includes("searchParams.get('review') === 'business'")) {
  platform = platform.replace("  React.useEffect(() => {\n    const channel = supabase.channel('platform-orgs-realtime')", `  React.useEffect(() => {
    if (searchParams.get('review') === 'business') {
      setSelectedOrgId(null);
    }
  }, [searchParams]);

  React.useEffect(() => {
    const channel = supabase.channel('platform-orgs-realtime')`);
}
platform = platform.replace('onClick={() => setSelectedOrgId(org.id)}', `onClick={() => {
                    setSelectedOrgId(org.id);
                    if (searchParams.get('review')) setSearchParams({});
                  }}`);
write('code/src/modules/platform/pages/PlatformOrganizations.jsx', platform);
