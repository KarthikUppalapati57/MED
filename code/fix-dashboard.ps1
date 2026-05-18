$file = Join-Path $PSScriptRoot "src\pages\Dashboard.jsx"
$content = [System.IO.File]::ReadAllText($file)

# Add useEffect and useQueryClient imports
$old1 = "import React from 'react';"
$new1 = "import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';"
$content = $content.Replace($old1, $new1)

# Add realtime subscription to PlatformDashboard
$old2 = "  const activeOrgs = allOrgs.filter(o => o.subscription_status === 'active');"
$new2 = "  // ── Realtime subscription for platform dashboard ──────────
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('platform-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dash-orgs'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dash-profiles'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dash-recent-logs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const activeOrgs = allOrgs.filter(o => o.subscription_status === 'active');"
$content = $content.Replace($old2, $new2)

# Add realtime subscription to OrgOwnerDashboard
$old3 = "  const pendingInvoices = invoices.filter(i => i.status === 'pending_review').length;
  const totalUnpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const lowStockItems = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
  const activeModules = organization?.enabled_modules?.length || 0;"
$new3 = "  // ── Realtime subscription for org dashboard ──────────────
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('org-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const pendingInvoices = invoices.filter(i => i.status === 'pending_review').length;
  const totalUnpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const lowStockItems = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
  const activeModules = organization?.enabled_modules?.length || 0;"
$content = $content.Replace($old3, $new3)

[System.IO.File]::WriteAllText($file, $content)
Write-Host "Dashboard.jsx updated successfully"
