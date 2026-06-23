import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Link2, AlertCircle, CheckCircle2, ArrowRightLeft, Lock, FileText, Calendar, Search } from 'lucide-react';
import { toast } from "sonner";
import { format } from 'date-fns';
import { useAuthInfiniteQuery, useAuthQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useInView } from '@/hooks/useInView';
import PaymentAccountsSettings from '@/components/invoices/PaymentAccountsSettings';
import StripePayPalPayouts from '@/components/accounting/StripePayPalPayouts';
import PeriodBudgetsTab from '@/components/accounting/PeriodBudgetsTab';
import AccountingExportQueueTab from '@/components/accounting/AccountingExportQueueTab';

export default function Accounting() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { organization, userProfile } = useAuth();
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const activeTab = currentSubPath || 'dashboard';

  const setActiveTab = (tab) => {
    navigate(`/Accounting/${tab}${location.search}`);
  };
  const needsInvoices = ['export', 'reconciliation'].includes(activeTab);
  const needsPayments = activeTab === 'reconciliation';
  const needsVendors = activeTab === 'vendor-mapping';
  const needsSalesData = ['sales-mapping', 'pmix-mapping'].includes(activeTab);
  const needsGlMappings = ['gl-mapping', 'sales-mapping'].includes(activeTab);
  const needsClosedPeriods = activeTab === 'close-books';

  const { data: logs = [], isLoading: loadingLogs } = useAuthQuery({
    queryKey: ['accounting_sync_logs'],
    queryFn: () => api.entities.AccountingSyncLog.list('-created_at', {
      limit: 50,
      select: 'id, entity_type, sync_status, error_message, created_at',
    }),
  });

  const { data: integrations = [], isLoading: loadingIntegrations } = useAuthQuery({
    queryKey: ['integrations'],
    queryFn: () => api.entities.Integration.list('-updated_at', {
      limit: 50,
      select: 'id, organization_id, provider, is_active, connected_at, updated_at',
    }),
  });

  const { data: closedPeriods = [], isLoading: loadingPeriods, refetch: refetchPeriods } = useAuthQuery({
    queryKey: ['closed_periods'],
    queryFn: () => api.entities.ClosedPeriod.list('-start_date', { limit: 100 }),
    enabled: needsClosedPeriods,
  });

  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 500);

  const { data: glMappings = [], isLoading: loadingGlMappings, refetch: refetchGlMappings } = useAuthQuery({
    queryKey: ['gl_mappings'],
    queryFn: () => api.entities.GlMapping.list('category'),
    enabled: needsGlMappings,
  });

  const {
    data: invoicesData,
    isLoading: loadingInvoices,
    fetchNextPage: fetchNextInvoices,
    hasNextPage: hasNextInvoices,
    isFetchingNextPage: isFetchingNextInvoices,
  } = useAuthInfiniteQuery({
    queryKey: ['accounting-invoices', debouncedSearch],
    queryFn: ({ pageParam = 0 }) => api.entities.Invoice.list('-created_at', {
      page: pageParam,
      pageSize: 50,
      search: needsInvoices ? debouncedSearch || undefined : undefined,
      searchColumn: 'invoice_number',
      select: 'id, invoice_number, vendor_name, invoice_date, due_date, status, total_amount, organization_id, brand_id, location_id',
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: needsInvoices,
  });
  const invoices = React.useMemo(() => invoicesData?.pages?.flat() || [], [invoicesData]);

  const {
    data: paymentsData,
    isLoading: loadingPayments,
    fetchNextPage: fetchNextPayments,
    hasNextPage: hasNextPayments,
    isFetchingNextPage: isFetchingNextPayments,
  } = useAuthInfiniteQuery({
    queryKey: ['accounting-payments', debouncedSearch],
    queryFn: ({ pageParam = 0 }) => api.entities.Payment.list('-payment_date', {
      page: pageParam,
      pageSize: 50,
      search: needsPayments ? debouncedSearch || undefined : undefined,
      searchColumn: 'invoice_number',
      select: 'id, invoice_id, payment_date, created_at, vendor_name, invoice_number, payment_method, amount, status, organization_id, brand_id, location_id',
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: needsPayments,
  });
  const payments = React.useMemo(() => paymentsData?.pages?.flat() || [], [paymentsData]);

  const {
    data: vendorsData,
    isLoading: loadingVendors,
    fetchNextPage: fetchNextVendors,
    hasNextPage: hasNextVendors,
    isFetchingNextPage: isFetchingNextVendors,
  } = useAuthInfiniteQuery({
    queryKey: ['accounting-vendors', debouncedSearch],
    queryFn: ({ pageParam = 0 }) => api.entities.Vendor.list('name', {
      page: pageParam,
      pageSize: 50,
      search: needsVendors ? debouncedSearch || undefined : undefined,
      searchColumn: 'name',
      select: 'id, name, accounting_vendor_id, accounting_vendor_name, status, organization_id, brand_id, location_id',
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: needsVendors,
  });
  const vendors = React.useMemo(() => vendorsData?.pages?.flat() || [], [vendorsData]);

  const {
    data: salesDataPages,
    isLoading: loadingSalesData,
    fetchNextPage: fetchNextSalesData,
    hasNextPage: hasNextSalesData,
    isFetchingNextPage: isFetchingNextSalesData,
  } = useAuthInfiniteQuery({
    queryKey: ['accounting-pos-sales-data', debouncedSearch],
    queryFn: ({ pageParam = 0 }) => api.entities.PosSalesData.list('-date', {
      page: pageParam,
      pageSize: 50,
      search: needsSalesData ? debouncedSearch || undefined : undefined,
      searchColumn: 'pos_item_id',
      select: 'id, pos_item_id, quantity_sold, revenue, date, organization_id, location_id',
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: needsSalesData,
  });
  const salesData = React.useMemo(() => salesDataPages?.pages?.flat() || [], [salesDataPages]);

  const { ref: loadMoreRef, isIntersecting } = useInView({ rootMargin: '100px' });

  React.useEffect(() => {
    if (isIntersecting) {
      if (needsInvoices && hasNextInvoices && !isFetchingNextInvoices) fetchNextInvoices();
      if (needsPayments && hasNextPayments && !isFetchingNextPayments) fetchNextPayments();
      if (needsVendors && hasNextVendors && !isFetchingNextVendors) fetchNextVendors();
      if (needsSalesData && hasNextSalesData && !isFetchingNextSalesData) fetchNextSalesData();
    }
  }, [
    isIntersecting,
    needsInvoices, hasNextInvoices, isFetchingNextInvoices, fetchNextInvoices,
    needsPayments, hasNextPayments, isFetchingNextPayments, fetchNextPayments,
    needsVendors, hasNextVendors, isFetchingNextVendors, fetchNextVendors,
    needsSalesData, hasNextSalesData, isFetchingNextSalesData, fetchNextSalesData
  ]);

  useEffect(() => {
    const channel = supabase.channel('accounting-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounting_sync_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['accounting_sync_logs'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integrations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['integrations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closed_periods' }, () => {
        queryClient.invalidateQueries({ queryKey: ['closed_periods'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gl_mappings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['gl_mappings'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [editingGlMapping, setEditingGlMapping] = React.useState(null);
  const [glForm, setGlForm] = React.useState({ gl_code: '', gl_name: '', description: '' });
  const [isSavingGlMapping, setIsSavingGlMapping] = React.useState(false);

  const activeIntegrations = integrations.filter(i => i.is_active).length;
  const recentErrors = logs.filter(l => l.sync_status === 'failed').length;
  const syncSuccessRate = logs.length > 0
    ? ((logs.filter(l => l.sync_status === 'success').length / logs.length) * 100).toFixed(1)
    : 100;

  const formatCurrency = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => value ? format(new Date(value), 'MMM dd, yyyy') : '-';
  const exportRows = (filename, rows) => {
    if (!rows.length) {
      toast.info('No rows available to export.');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(key => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const invoiceExportRows = invoices.map(invoice => ({
    invoice_number: invoice.invoice_number,
    vendor_name: invoice.vendor_name,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    status: invoice.status,
    total_amount: invoice.total_amount,
  }));

  const reconciliationRows = payments.map(payment => {
    const invoice = invoices.find(item => item.id === payment.invoice_id);
    return {
      id: payment.id,
      payment_date: payment.payment_date || payment.created_at,
      vendor_name: payment.vendor_name || invoice?.vendor_name || '-',
      invoice_number: payment.invoice_number || invoice?.invoice_number || '-',
      method: payment.payment_method || '-',
      amount: payment.amount,
      status: payment.status || 'recorded',
    };
  });

  const salesMappingRows = salesData.slice(0, 25).map(item => ({
    source: 'POS',
    category: 'Sales',
    revenue: item.revenue || 0,
    gl_code: glMappings.find(mapping => mapping.category === 'Sales')?.gl_code || 'Unmapped',
  }));

  const vendorMappingRows = vendors.map(vendor => ({
    vendor_name: vendor.name,
    accounting_name: vendor.accounting_vendor_name || vendor.name,
    accounting_id: vendor.accounting_vendor_id || '-',
    status: vendor.status || 'active',
  }));

  const pmixRows = salesData.slice(0, 25).map(item => ({
    item_name: item.pos_item_id || 'Unmapped item',
    category: 'POS',
    quantity: item.quantity_sold || 0,
    revenue: item.revenue || 0,
  }));

  const handleClosePeriod = async () => {
    const organizationId = organization?.id || userProfile?.organization_id;
    if (!organizationId) {
      toast.error('No organization found for this accounting period.');
      return;
    }
    setIsClosing(true);
    try {
      const now = new Date();
      const month = now.toLocaleString('default', { month: 'long' });
      await api.entities.ClosedPeriod.create({
        organization_id: organizationId,
        period_name: `${month} ${now.getFullYear()} (Current)`,
        start_date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
        end_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
        closed_by: userProfile?.id,
        notes: 'Manually closed by user'
      });
      toast.success("Accounting period successfully locked.");
      setCloseDialogOpen(false);
      refetchPeriods();
    } catch (e) {
      toast.error("Failed to close period.");
    } finally {
      setIsClosing(false);
    }
  };

  const openGlMappingEditor = (mapping) => {
    setEditingGlMapping(mapping);
    setGlForm({
      gl_code: mapping.gl_code || '',
      gl_name: mapping.gl_name || '',
      description: mapping.description || '',
    });
  };

  const handleSaveGlMapping = async () => {
    if (!editingGlMapping || !glForm.gl_code.trim() || !glForm.gl_name.trim()) return;
    setIsSavingGlMapping(true);
    try {
      await api.entities.GlMapping.update(editingGlMapping.id, {
        gl_code: glForm.gl_code.trim(),
        gl_name: glForm.gl_name.trim(),
        description: glForm.description.trim() || null,
      });
      toast.success(`${editingGlMapping.category} mapping updated.`);
      setEditingGlMapping(null);
      refetchGlMappings();
    } catch (e) {
      toast.error(e.message || 'Failed to update GL mapping.');
    } finally {
      setIsSavingGlMapping(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-scale">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Accounting & Reconciliation</h1>
        <p className="text-muted-foreground mt-1 text-lg">Manage financial integrations, sync logs, and accounting exports/reconciliation.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-brand/10 rounded-xl">
              <Link2 className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Integrations</p>
              <h3 className="text-2xl font-bold text-foreground">{activeIntegrations}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-green/10 rounded-xl">
              <CheckCircle2 className="h-6 w-6 text-resend-green" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sync Success Rate</p>
              <h3 className="text-2xl font-bold text-foreground">{syncSuccessRate}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-red/10 rounded-xl">
              <AlertCircle className="h-6 w-6 text-resend-red" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Recent Sync Errors</p>
              <h3 className="text-2xl font-bold text-foreground">{recentErrors}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col lg:flex-row gap-4 mb-6 items-start lg:items-center justify-between border-b pb-2">
          <TabsList className="flex flex-wrap gap-2 h-auto bg-transparent rounded-none justify-start">
            <TabsTrigger value="dashboard" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Dashboard</TabsTrigger>
            <TabsTrigger value="export" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Export</TabsTrigger>
            <TabsTrigger value="bill-pay" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent text-indigo-600 font-semibold">Bill Pay</TabsTrigger>
            <TabsTrigger value="reconciliation" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Reconciliation</TabsTrigger>
            <TabsTrigger value="gl-mapping" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">GL Mapping</TabsTrigger>
            <TabsTrigger value="sales-mapping" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Mapping</TabsTrigger>
            <TabsTrigger value="export-queue" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Export Queue</TabsTrigger>
            <TabsTrigger value="vendor-mapping" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Vendor Mapping</TabsTrigger>
            <TabsTrigger value="pmix-mapping" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">PMIX Mapping</TabsTrigger>
            <TabsTrigger value="payment-accounts" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Payment Accounts</TabsTrigger>
            <TabsTrigger value="budgets" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent text-teal-600 font-semibold">Budgets</TabsTrigger>
            <TabsTrigger value="close-books" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Close Books</TabsTrigger>
          </TabsList>
          {['export', 'reconciliation', 'vendor-mapping', 'sales-mapping', 'pmix-mapping'].includes(activeTab) && (
            <div className="relative w-full lg:w-64 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-6">
              <Card className="glass-card border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <ArrowRightLeft className="w-5 h-5 mr-2 text-brand" />
                    Connected Systems
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingIntegrations ? (
                    <p className="text-sm text-muted-foreground">Loading integrations...</p>
                  ) : integrations.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-border/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-4">No integrations connected.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/Integrations')}
                        className="px-4 py-2 bg-brand text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Connect QuickBooks
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {integrations.map(integration => (
                        <div key={integration.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${integration.is_active ? 'bg-resend-green' : 'bg-muted-foreground'}`} />
                            <span className="font-medium capitalize">{integration.provider}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(integration.connected_at), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="glass-card border-border/50 shadow-sm h-full">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Sync Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingLogs ? (
                    <p className="text-muted-foreground text-sm">Loading logs...</p>
                  ) : logs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No sync activity recorded yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.slice(0, 10).map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(log.created_at), 'MMM dd, HH:mm')}
                            </TableCell>
                            <TableCell className="capitalize">{log.entity_type}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                log.sync_status === 'success' ? 'bg-resend-green/10 text-resend-green' :
                                log.sync_status === 'failed' ? 'bg-resend-red/10 text-resend-red' :
                                'bg-resend-yellow/10 text-resend-yellow'
                              }`}>
                                {log.sync_status}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {log.error_message || 'Synced successfully'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="budgets" className="space-y-6">
          <PeriodBudgetsTab />
        </TabsContent>

        <TabsContent value="export-queue" className="space-y-6">
          <AccountingExportQueueTab />
        </TabsContent>

        <TabsContent value="close-books" className="space-y-6">
          <Card className="border-rose-100 dark:border-rose-900/50 shadow-sm overflow-hidden bg-rose-50/30 dark:bg-rose-950/20">
            <CardHeader className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900/50">
              <CardTitle className="flex items-center text-rose-900">
                <Lock className="w-5 h-5 mr-2 text-rose-600" />
                Audit-Ready Books
              </CardTitle>
              <CardDescription className="text-rose-700/80">
                Lock historical data to prevent retroactive changes from affecting your accounting sync.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
                <div className="space-y-4 max-w-xl">
                  <p className="text-sm text-muted-foreground">
                    Closing a period will lock all invoices, inventory counts, and waste logs prior to the end date. This ensures that what is exported to QuickBooks or Sage Intacct perfectly matches the data in Restops, ensuring full enterprise audit readiness.
                  </p>
                  <Button onClick={() => setCloseDialogOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20">
                    <Calendar className="w-4 h-4 mr-2" />
                    Close Current Period
                  </Button>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="font-medium text-sm mb-4 text-foreground flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                  Closed Periods History
                </h3>
                {loadingPeriods ? (
                  <p className="text-sm text-muted-foreground">Loading closed periods...</p>
                ) : closedPeriods.length === 0 ? (
                  <div className="p-4 border rounded bg-card text-sm text-muted-foreground">No periods have been closed yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period Name</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Closed At</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedPeriods.map(period => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium text-slate-900">{period.period_name}</TableCell>
                          <TableCell>{period.start_date}</TableCell>
                          <TableCell>{period.end_date}</TableCell>
                          <TableCell>{format(new Date(period.closed_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                          <TableCell className="text-muted-foreground">{period.notes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Accounting Export</CardTitle>
                <CardDescription>Export approved invoice data for accounting import or reconciliation review.</CardDescription>
              </div>
              <Button variant="outline" onClick={() => exportRows('accounting-invoice-export.csv', invoiceExportRows)}>
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <p className="text-sm text-muted-foreground">Loading export rows...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceExportRows.slice(0, 20).map(row => (
                      <TableRow key={`${row.invoice_number}-${row.vendor_name}`}>
                        <TableCell className="font-medium">{row.invoice_number || '-'}</TableCell>
                        <TableCell>{row.vendor_name || '-'}</TableCell>
                        <TableCell>{formatDate(row.invoice_date)}</TableCell>
                        <TableCell>{formatDate(row.due_date)}</TableCell>
                        <TableCell className="capitalize">{row.status?.replace('_', ' ') || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                    {invoiceExportRows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No invoices available for export.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bill-pay" className="space-y-6">
          <StripePayPalPayouts />
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-6">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Reconciliation</CardTitle>
              <CardDescription>Compare recorded payments against their source invoices.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPayments || loadingInvoices ? (
                <p className="text-sm text-muted-foreground">Loading reconciliation records...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliationRows.slice(0, 20).map(row => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.payment_date)}</TableCell>
                        <TableCell>{row.vendor_name}</TableCell>
                        <TableCell>{row.invoice_number}</TableCell>
                        <TableCell className="capitalize">{row.method}</TableCell>
                        <TableCell className="capitalize">{row.status?.replace('_', ' ')}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {reconciliationRows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No payment records available for reconciliation.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gl-mapping" className="space-y-6">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>GL Accounts Mapping</CardTitle>
              <CardDescription>Map inventory categories to General Ledger accounts for accounting sync.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingGlMappings ? (
                <p className="text-sm text-muted-foreground">Loading GL mappings...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>GL Code</TableHead>
                      <TableHead>GL Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glMappings.map(mapping => (
                      <TableRow key={mapping.id}>
                        <TableCell className="font-medium capitalize">{mapping.category}</TableCell>
                        <TableCell className="font-mono text-brand">{mapping.gl_code}</TableCell>
                        <TableCell>{mapping.gl_name}</TableCell>
                        <TableCell className="text-muted-foreground">{mapping.description}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openGlMappingEditor(mapping)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {glMappings.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No GL mappings found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales-mapping" className="space-y-6">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Sales Mapping</CardTitle>
              <CardDescription>Review POS sales categories and their current GL mapping status.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSalesData || loadingGlMappings ? (
                <p className="text-sm text-muted-foreground">Loading sales mapping...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>GL Code</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesMappingRows.map((row, index) => (
                      <TableRow key={`${row.source}-${row.category}-${index}`}>
                        <TableCell>{row.source}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className={row.gl_code === 'Unmapped' ? 'text-resend-orange' : 'font-mono text-brand'}>{row.gl_code}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {salesMappingRows.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No POS sales data available yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendor-mapping" className="space-y-6">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Vendor Mapping</CardTitle>
              <CardDescription>Track vendor names and accounting system identifiers used during sync.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingVendors ? (
                <p className="text-sm text-muted-foreground">Loading vendor mappings...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Accounting Name</TableHead>
                      <TableHead>Accounting ID</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorMappingRows.map((row, index) => (
                      <TableRow key={`${row.vendor_name}-${index}`}>
                        <TableCell className="font-medium">{row.vendor_name || '-'}</TableCell>
                        <TableCell>{row.accounting_name || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{row.accounting_id}</TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                      </TableRow>
                    ))}
                    {vendorMappingRows.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No vendors available for mapping.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pmix-mapping" className="space-y-6">
          <Card className="glass-card border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>PMIX Mapping</CardTitle>
              <CardDescription>Review product mix records imported from POS sales feeds.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSalesData ? (
                <p className="text-sm text-muted-foreground">Loading PMIX records...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Menu Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pmixRows.map((row, index) => (
                      <TableRow key={`${row.item_name}-${index}`}>
                        <TableCell className="font-medium">{row.item_name}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="text-right">{Number(row.quantity || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {pmixRows.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No PMIX data available yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-accounts" className="space-y-6">
          <PaymentAccountsSettings />
        </TabsContent>

      </Tabs>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Accounting Period</DialogTitle>
            <DialogDescription>
              Are you sure you want to close the current period? This will lock all operational records prior to today.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-sm font-medium">
            This action cannot be undone by store-level staff. It requires an Administrator to unlock.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button disabled={isClosing} onClick={handleClosePeriod} className="bg-rose-600 hover:bg-rose-700 text-white">
              {isClosing ? 'Closing...' : 'Confirm Close Books'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGlMapping} onOpenChange={(open) => !open && setEditingGlMapping(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit GL Mapping</DialogTitle>
            <DialogDescription>
              Update the accounting code used when syncing this inventory category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Category</Label>
              <Input value={editingGlMapping?.category || ''} disabled className="mt-1 capitalize" />
            </div>
            <div>
              <Label>GL Code</Label>
              <Input
                value={glForm.gl_code}
                onChange={(e) => setGlForm(prev => ({ ...prev, gl_code: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>GL Name</Label>
              <Input
                value={glForm.gl_name}
                onChange={(e) => setGlForm(prev => ({ ...prev, gl_name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={glForm.description}
                onChange={(e) => setGlForm(prev => ({ ...prev, description: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingGlMapping(null)}>Cancel</Button>
            <Button
              onClick={handleSaveGlMapping}
              disabled={isSavingGlMapping || !glForm.gl_code.trim() || !glForm.gl_name.trim()}
            >
              {isSavingGlMapping ? 'Saving...' : 'Save Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
