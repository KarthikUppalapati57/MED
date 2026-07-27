import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery, useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useRequireLocation } from '@/hooks/useRequireLocation';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { filterByContext } from '@/lib/contextUtils';
import { invalidateInvoiceLists } from '@/lib/query-client';
import { format, subDays, subMonths } from 'date-fns';
import {
  Search,
  CreditCard,
  Building2,
  Banknote,
  CheckSquare,
  DollarSign,
  Clock,
  AlertCircle,
  Check,
  X,
  History,
  Wallet,
  CheckCircle2,
  ArrowRightLeft,
  Settings,
  FileText,
  Mail,
  Sparkles,
  ExternalLink,
  Loader2,
  Bell,
  Plus,
  ChevronDown
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PaymentAccountsSettings from '@/modules/invoices/components/PaymentAccountsSettings';
import StripePaymentForm from '@/modules/payments/components/StripePaymentForm';
import { confirmBankTransfer } from '@/lib/paymentService';
import { ensureLedgerBill, recordPaymentLedger } from '@/lib/workflowService';
import { isPaymentQueueRouted } from '@/lib/apRouting';
import { AP_STATUS_LABELS, deriveApStatus, isInvoicePaymentReady } from '@/lib/invoiceAp';
import { useConfirm } from '@/hooks/useConfirm';
import { runApprovalGate } from '@/modules/invoices/lib/invoiceValidation';

function formatVendorAddress(vendor) {
  if (!vendor) return '';
  const line1 = vendor.remittance_address_line1 || vendor.mailing_address_line1 || vendor.address;
  const line2 = vendor.remittance_address_line2 || vendor.mailing_address_line2 || '';
  const city = vendor.remittance_city || vendor.mailing_city || vendor.city;
  const state = vendor.remittance_state || vendor.mailing_state || vendor.state;
  const zip = vendor.remittance_zip_code || vendor.mailing_zip_code || vendor.zip_code;
  return [line1, line2, [city, state, zip].filter(Boolean).join(', ')].filter(Boolean).join(' � ');
}
function CreateCheckDialog({ open, onClose, organization, brand, location, confirm }) {
  const queryClient = useQueryClient();
  const { hasLocation, warnIfMissing } = useRequireLocation();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('checkbook_digital');

  const { data: vendors = [] } = useAuthQuery({
    queryKey: ['vendors-for-check', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name, email, address, city, state, zip_code')
        .eq('organization_id', organization?.id).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!organization?.id,
  });

  const { data: paymentAccounts = [] } = useAuthQuery({
    queryKey: ['payment-accounts-for-check', organization?.id],
    queryFn: () => api.entities.PaymentAccount.filter({ organization_id: organization?.id, is_active: true }, { orderBy: 'name' }),
    enabled: open && !!organization?.id,
  });

  const reset = () => { setVendorId(''); setAmount(''); setMemo(''); setPaymentAccountId(''); setPayoutMethod('checkbook_digital'); };

  const createCheckMutation = useMutation({
    mutationFn: async () => {
      const vendor = vendors.find(v => v.id === vendorId);
      if (!vendor) throw new Error('Select a vendor');
      const numericAmount = parseFloat(amount);
      if (!(numericAmount > 0)) throw new Error('Enter a valid amount');
      if (!paymentAccountId) throw new Error('Select a payment account');
      const locationId = location?.id || null;
      const brandId = brand?.brand_id || brand?.id || null;
      if (!brandId || !locationId) throw new Error('Please select a location to continue');

      const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert({
        organization_id: organization?.id,
        brand_id: brandId,
        location_id: locationId,
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        invoice_number: memo.trim() || `Manual Check ${format(new Date(), 'MMM d, yyyy h:mm a')}`,
        total_amount: numericAmount,
        status: 'approved',
        ap_routing_destination: 'payments',
      }).select('id').single();
      if (invoiceError) throw invoiceError;

      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: { invoice_id: invoice.id, payout_method: payoutMethod, payment_account_id: paymentAccountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Check issued');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      invalidateInvoiceLists();
      reset();
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Failed to issue check'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write a Check</DialogTitle>
          <DialogDescription>Issue a one-off check outside the normal invoice-approval queue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Memo (appears as the check's reference)</Label>
            <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="e.g. Equipment deposit refund" />
          </div>
          <div>
            <Label>Payment Account (signs the check)</Label>
            <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {paymentAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}{acc.last4 ? ` (...${acc.last4})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Delivery Method</Label>
            <Select value={payoutMethod} onValueChange={setPayoutMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checkbook_digital">Digital Check (email)</SelectItem>
                <SelectItem value="checkbook_physical">Mailed Physical Check</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={async () => {
            if (!warnIfMissing()) return;
            const vendor = vendors.find(v => v.id === vendorId);
            const ok = await confirm({
              title: 'Issue check?',
              description: `This creates a new invoice record and immediately issues a real ${payoutMethod === 'checkbook_physical' ? 'mailed check' : 'digital check'} payout of $${amount || '0.00'} to ${vendor?.name || 'this vendor'}, outside the normal approval queue. This cannot be undone.`,
              confirmLabel: 'Issue Check',
              destructive: true,
            });
            if (!ok) return;
            createCheckMutation.mutate();
          }} disabled={createCheckMutation.isPending} className={cn(!hasLocation && "opacity-50 cursor-not-allowed")}>
            {createCheckMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Issue Check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const paymentMethodIcons = {
  stripe: CreditCard,
  stripe_card: CreditCard,
  paypal: Wallet,
  bank_transfer: Building2,
  ach: Building2,
  stripe_connect_custom: Building2,
  checkbook_digital: CheckSquare,
  checkbook_physical: CheckSquare,
  cheque: CheckSquare,
  cash: Banknote,
  manual: Banknote,
};

const paymentMethodColors = {
  stripe: 'bg-purple-500/50/10 text-purple-400',
  stripe_card: 'bg-purple-500/50/10 text-purple-400',
  paypal: 'bg-resend-blue/10 text-resend-blue',
  bank_transfer: 'bg-resend-green/10 text-resend-green',
  ach: 'bg-resend-green/10 text-resend-green',
  stripe_connect_custom: 'bg-resend-green/10 text-resend-green',
  checkbook_digital: 'bg-resend-orange/10 text-resend-orange',
  checkbook_physical: 'bg-resend-orange/10 text-resend-orange',
  cheque: 'bg-resend-orange/10 text-resend-orange',
  cash: 'bg-resend-green/10 text-resend-green',
  manual: 'bg-secondary text-foreground',
};

const VENDOR_PAYOUT_METHODS = [
  { value: 'stripe_connect_custom', label: 'ACH', detail: 'Bank transfer', icon: Building2, enabled: true },
  { value: 'stripe_card', label: 'Card', detail: 'Card payment', icon: CreditCard, enabled: true, schedulable: false },
  { value: 'checkbook_digital', label: 'Digital Check', detail: 'Email delivery', icon: CheckSquare, enabled: true },
  { value: 'checkbook_physical', label: 'Mailed Check', detail: 'Postal delivery', icon: Mail, enabled: true },
];

const PAYOUT_METHOD_LABELS = Object.fromEntries(VENDOR_PAYOUT_METHODS.map((method) => [method.value, method.label]));
const paymentStatusColors = {
  completed: 'bg-resend-green/10 text-resend-green',
  pending: 'bg-resend-yellow/10 text-resend-yellow',
  failed: 'bg-resend-red/10 text-resend-red',
  refunded: 'bg-purple-500/50/10 text-purple-400',
};

const invoiceStatusColors = {
  approved: 'bg-resend-green/10 text-resend-green',
  paid: 'bg-primary/10 text-primary',
  rejected: 'bg-resend-red/10 text-resend-red',
  pending_review: 'bg-resend-orange/10 text-resend-orange',
  validated: 'bg-resend-blue/10 text-resend-blue',
  flagged: 'bg-resend-yellow/10 text-resend-yellow',
};

const PAYMENT_ROW_HEIGHT = 72;
const PAYMENT_TABLE_VIEWPORT_HEIGHT = 648;
const PAYMENT_ROW_OVERSCAN = 8;
const APPROVAL_ACTION_STATUSES = new Set(['validated', 'pending_review', 'pending_approval', 'flagged']);

const isApprovedForPaymentQueue = isInvoicePaymentReady;

const canApproveFromPaymentQueue = (invoice) => (
  APPROVAL_ACTION_STATUSES.has(invoice?.status) && !isApprovedForPaymentQueue(invoice)
);

export default function Payments() {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [sortBy, setSortBy] = useState('-created_at');
  // Separate from `sortBy` (Payment History, which has no due_date column) -- Invoices tab
  // defaults to soonest/most-overdue-first so invoices close to their due date surface first.
  const [invoiceSortBy, setInvoiceSortBy] = useState('due_date');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const invoiceTableRef = React.useRef(null);
  const paymentHistoryTableRef = React.useRef(null);
  const [invoiceTableScrollTop, setInvoiceTableScrollTop] = useState(0);
  const [paymentHistoryTableScrollTop, setPaymentHistoryTableScrollTop] = useState(0);
  const [scheduleDialogInvoice, setScheduleDialogInvoice] = useState(null);
  const [recordDialogInvoice, setRecordDialogInvoice] = useState(null);
  const [releaseDialogInvoice, setReleaseDialogInvoice] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    payment_account_id: '',
    scheduled_payment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    payout_method: 'stripe_connect_custom',
  });
  const [recordForm, setRecordForm] = useState({
    amount: '',
    reference: '',
    method: 'cheque',
  });
  const [releaseForm, setReleaseForm] = useState({
    payment_account_id: '',
    payout_method: 'stripe_connect_custom',
  });
  const [paymentSettings, setPaymentSettings] = useState({
    autoPayApprovedInvoices: false,
    defaultPaymentMethod: 'stripe_connect_custom',
    approvalThreshold: 1000,
    requireSeparateApprover: false,
    enforceApprovalLimits: false,
    confirmationEmail: true,
    overdueAlerts: true,
    weeklySummary: false,
  });
  const [newReminderDay, setNewReminderDay] = useState('');
  const [paymentDateFilter, setPaymentDateFilter] = useState('all');
  const [showCreateCheck, setShowCreateCheck] = useState(false);
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const routerLocation = useLocation();
  const pathParts = routerLocation.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';
  const queryParams = new URLSearchParams(routerLocation.search);
  const queryTab = queryParams.get('tab');

  const activeTab = currentSubPath || queryTab || 'invoices';

  const setActiveTab = (tab) => {
    const nextParams = new URLSearchParams(routerLocation.search);
    nextParams.delete('tab');
    const search = nextParams.toString();
    navigate(`/Payments/${tab}${search ? `?${search}` : ''}`);
  };

  const queryClient = useQueryClient();
  const { organization, brand, location, userProfile } = useAuth();

  // Org-wide roles see invoices/payments across brands/locations without picking one --
  // correct per RLS, but the lists need to say whose row is whose.
  const { data: orgLocationsForLabels = [] } = useAuthQuery({
    queryKey: ['payments-location-labels', organization?.id],
    queryFn: () => api.entities.Location.list(),
    enabled: !!organization?.id,
  });
  const { data: orgBrandsForLabels = [] } = useAuthQuery({
    queryKey: ['payments-brand-labels', organization?.id],
    queryFn: () => api.entities.Brand.list(),
    enabled: !!organization?.id,
  });
  const locationNameById = React.useMemo(
    () => new Map(orgLocationsForLabels.map((loc) => [loc.id, loc.name])),
    [orgLocationsForLabels]
  );
  const brandNameById = React.useMemo(
    () => new Map(orgBrandsForLabels.map((b) => [b.brand_id, b.name])),
    [orgBrandsForLabels]
  );
  const LocationCell = ({ row }) => (
    <TableCell>
      <div className="text-sm">{locationNameById.get(row?.location_id) || 'Unknown location'}</div>
      <div className="text-xs text-muted-foreground">{brandNameById.get(row?.brand_id) || ''}</div>
    </TableCell>
  );

  const {
    data = {},
    isLoading: invoicesLoading,
    fetchNextPage: fetchNextInvoicesPage,
    hasNextPage: hasNextInvoicesPage,
    isFetchingNextPage: isFetchingNextInvoicesPage
  } = useAuthInfiniteQuery({
    queryKey: ['invoices-payments', organization?.id, (brand?.brand_id || brand?.id), location?.id, activeTab, debouncedSearch, statusFilter, invoiceSortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const filters = {};
      if (organization?.id) filters.organization_id = organization.id;
      const selectedBrandId = (brand?.brand_id || brand?.id) || null;
      if (selectedBrandId) filters.brand_id = selectedBrandId;
      if (location?.id) filters.location_id = location.id;
      if (statusFilter !== 'all') {
        if (statusFilter === 'partial') {
           filters.payment_status = 'partial';
        } else if (statusFilter === 'paid') {
           filters.payment_status = 'paid';
        } else if (statusFilter === 'auto_pay') {
           filters.payment_status = 'auto_pay';
        } else {
           filters.status = statusFilter;
        }
      }
      return await api.entities.Invoice.filter(filters, {
        page: pageParam,
        pageSize: 50,
        select: 'id, invoice_number, vendor_id, vendor_name, total_amount, paid_amount, status, ap_status, action_required_reason, match_status, payment_status, due_date, invoice_date, scheduled_payment_date, payment_account_id, organization_id, brand_id, location_id, ap_routing_destination, ap_metadata',
        search: activeTab === 'invoices' ? debouncedSearch || undefined : undefined,
        searchColumn: 'invoice_number',
        orderBy: invoiceSortBy
      });
    },
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!(organization?.id),
  });

  const invoicesData = data;

  const invoices = React.useMemo(() => {
    if (!invoicesData?.pages) return [];
    return filterByContext(invoicesData.pages.flat(), { organization, brand, location });
  }, [invoicesData, organization, brand, location]);
  const vendorIdsForPayments = React.useMemo(
    () => Array.from(new Set(invoices.map((invoice) => invoice.vendor_id).filter(Boolean))),
    [invoices]
  );

  const { data: paymentVendors = [] } = useAuthQuery({
    queryKey: ['payment-vendors', organization?.id, vendorIdsForPayments.join(',')],
    queryFn: () => api.entities.Vendor.filter(
      { organization_id: organization?.id },
      {
        select: 'id, name, email, phone, address, city, state, zip_code, remittance_address_line1, remittance_address_line2, remittance_city, remittance_state, remittance_zip_code, mailing_address_line1, mailing_address_line2, mailing_city, mailing_state, mailing_zip_code',
      }
    ),
    select: React.useCallback(
      (rows) => (rows || []).filter((vendor) => vendorIdsForPayments.includes(vendor.id)),
      [vendorIdsForPayments]
    ),
    enabled: !!organization?.id && vendorIdsForPayments.length > 0,
  });

  const paymentVendorById = React.useMemo(
    () => new Map(paymentVendors.map((vendor) => [vendor.id, vendor])),
    [paymentVendors]
  );

  const {
    data: pData = {},
    isLoading: paymentsLoading,
    fetchNextPage: fetchNextPaymentsPage,
    hasNextPage: hasNextPaymentsPage,
    isFetchingNextPage: isFetchingNextPaymentsPage
  } = useAuthInfiniteQuery({
    queryKey: ['payments', organization?.id, (brand?.brand_id || brand?.id), location?.id, activeTab, debouncedSearch, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      return await api.entities.Payment.list(sortBy, {
        page: pageParam,
        pageSize: 50,
        select: 'id, invoice_id, invoice_number, vendor_id, vendor_name, amount, status, payment_method, payment_date, created_at, organization_id, brand_id, location_id',
        search: activeTab === 'history' ? debouncedSearch || undefined : undefined,
        searchColumn: 'invoice_number'
      });
    },
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!(organization?.id),
  });

  const paymentsData = pData;

  const payments = React.useMemo(() => {
    if (!paymentsData?.pages) return [];
    return filterByContext(paymentsData.pages.flat(), { organization, brand, location });
  }, [paymentsData, organization, brand, location]);

  const { data: paymentAccounts = [] } = useAuthQuery({
    queryKey: ['payment-accounts', organization?.id],
    queryFn: () => api.entities.PaymentAccount.filter({ organization_id: organization?.id }, { orderBy: 'name' }),
    select: React.useCallback(
      (data) => (data || []).filter((account) => account.is_active !== false),
      []
    ),
    enabled: !!organization?.id && ['invoices', 'schedule', 'setup'].includes(activeTab),
  });

  const { data: orgPlans = [] } = useAuthQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await supabase.from('plans').select('id, name, price_monthly, features').eq('is_active', true);
      return data || [];
    },
    enabled: activeTab === 'subscription',
  });

  const { data: settingsRows = [] } = useAuthQuery({
    queryKey: ['operational_settings', organization?.id, (brand?.brand_id || brand?.id), location?.id, 'payments'],
    queryFn: () => api.entities.OperationalSetting.filter({ organization_id: organization?.id }),
    enabled: !!organization?.id && activeTab === 'setup',
  });

  const paymentSettingsRow = settingsRows.find((row) => row.category === 'payments');

  useEffect(() => {
    if (paymentSettingsRow?.settings) {
      setPaymentSettings((prev) => ({ ...prev, ...paymentSettingsRow.settings }));
    }
  }, [paymentSettingsRow]);

  const [portalLoading, setPortalLoading] = useState(false);
  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { returnUrl: window.location.href }
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to open billing portal. Please contact support.');
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    const channel = supabase.channel('payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);


  const updateInvoice = useMutation({
    mutationFn: (params) => api.financial.saveInvoice({ invoiceId: params.id, invoice: params.data }),
    onSuccess: (updatedInvoice) => {
      queryClient.setQueriesData({ queryKey: ['invoices-payments'] }, (oldData) => {
        if (!oldData?.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map(page => 
            page.map(inv => inv.id === updatedInvoice.id ? { ...inv, ...updatedInvoice } : inv)
          )
        };
      });
      queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
    },
    onError: (error) => toast.error(error.message || 'Failed to update invoice'),
  });

  const savePaymentSettings = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organization?.id,
        brand_id: (brand?.brand_id || brand?.id) || null,
        location_id: location?.id || null,
        scope: location?.id ? 'location' : (brand?.brand_id || brand?.id) ? 'brand' : 'organization',
        category: 'payments',
        settings: paymentSettings,
        created_by: userProfile?.id || null,
        updated_by: userProfile?.id || null,
      };
      if (paymentSettingsRow) return api.entities.OperationalSetting.update(paymentSettingsRow.id, payload);
      return api.entities.OperationalSetting.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational_settings', organization?.id, (brand?.brand_id || brand?.id), location?.id, 'payments'] });
      toast.success('Payment settings saved');
    },
    onError: (error) => toast.error(error.message || 'Failed to save payment settings'),
  });

  const { data: reminderSettings } = useAuthQuery({
    queryKey: ['invoice-reminder-settings', userProfile?.id],
    queryFn: async () => {
      const rows = await api.entities.InvoiceReminderSettings.filter({ user_id: userProfile.id });
      return rows?.[0] || null;
    },
    enabled: !!userProfile?.id && activeTab === 'setup',
  });

  const reminderDays = reminderSettings?.reminder_days || [7, 3, 1];
  const reminderEnabled = reminderSettings?.enabled !== false;

  const saveReminderSettings = useMutation({
    mutationFn: async ({ reminder_days, enabled }) => {
      // invoice_reminder_settings is keyed by user_id (not id), so the generic entity
      // client's update() -- which always does .eq('id', ...) -- doesn't fit; upsert directly.
      const { data, error } = await supabase
        .from('invoice_reminder_settings')
        .upsert({
          user_id: userProfile.id,
          organization_id: organization?.id,
          reminder_days,
          enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-reminder-settings', userProfile?.id] });
      toast.success('Reminder settings saved');
    },
    onError: (error) => toast.error(error.message || 'Failed to save reminder settings'),
  });

  const handleAddReminderDay = () => {
    const day = parseInt(newReminderDay, 10);
    if (!Number.isFinite(day) || day < 0 || reminderDays.includes(day)) return;
    const next = [...reminderDays, day].sort((a, b) => b - a);
    saveReminderSettings.mutate({ reminder_days: next, enabled: reminderEnabled });
    setNewReminderDay('');
  };

  const handleRemoveReminderDay = (day) => {
    saveReminderSettings.mutate({ reminder_days: reminderDays.filter(d => d !== day), enabled: reminderEnabled });
  };

  const schedulePayment = useMutation({
    mutationFn: async ({ invoice, paymentAccountId, date, payoutMethod }) => {
      const { error } = await supabase.rpc('schedule_invoice_payment', {
        p_invoice_id: invoice.id,
        p_payment_account_id: paymentAccountId,
        p_date: date,
      });
      if (error) throw error;

      const nextMetadata = { ...(invoice.ap_metadata || {}), scheduled_payout_method: payoutMethod };
      const { error: metadataError } = await supabase
        .from('invoices')
        .update({ ap_metadata: nextMetadata })
        .eq('id', invoice.id);
      if (metadataError) throw metadataError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      setScheduleDialogInvoice(null);
      toast.success('Payment scheduled');
    },
    onError: (error) => toast.error(error.message || 'Failed to schedule payment'),
  });

  const recordInvoicePayment = useMutation({
    mutationFn: async ({ invoice, amount, reference, method }) => {
      const { data, error } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoice.id,
        p_amount: Number(amount),
        p_reference: reference,
        p_payment_method: method,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-payments'] });
      setRecordDialogInvoice(null);
      setRecordForm({ amount: '', reference: '', method: 'cheque' });
      toast.success(result?.status === 'partially_paid' ? 'Partial payment recorded' : 'Payment recorded');
    },
    onError: (error) => toast.error(error.message || 'Failed to record payment'),
  });

  const getVendorFileDestination = async (vendorId) => {
    if (!vendorId) return 'storage';
    try {
      const vendor = await api.entities.Vendor.get(vendorId);
      return vendor?.file_routing_preference || 'storage';
    } catch (e) {
      console.warn('Failed to fetch vendor for file routing:', e);
      return 'storage';
    }
  };

  const handleApprove = async (invoice) => {
    if (!(await runApprovalGate(confirm, invoice))) return;
    try {
      const approvedInvoice = await updateInvoice.mutateAsync({
        id: invoice.id,
        data: {
          status: 'approved',
          ap_status: 'approved',
          approved_by: userProfile?.id || null,
          approved_date: new Date().toISOString(),
          action_required_reason: null,
          action_required_details: null,
        },
      });
      await ensureLedgerBill({ ...invoice, ...approvedInvoice, organization_id: invoice.organization_id || organization?.id }, { status: 'pending' });
      toast.success('Invoice approved');
    } catch (error) {
      console.error('Payment queue approve failed:', error);
    }
  };

  const handleReject = async (invoice) => {
    if (!(await confirm({
      title: 'Reject invoice?',
      description: 'This will mark the invoice as rejected and remove it from the payment queue. This cannot be undone.',
      confirmLabel: 'Reject',
      destructive: false,
    }))) return;
    try {
      await updateInvoice.mutateAsync({ id: invoice.id, data: { status: 'rejected', ap_status: 'rejected' } });
      toast.success('Invoice rejected');
    } catch (error) {
      console.error('Payment queue reject failed:', error);
    }
  };

  // Stats
  const { approvedUnpaid, totalDue, totalPaid, pendingPayments, overdue, overdueAmount, scheduledInvoices, scheduledAmount, partialInvoices, dueNextSevenAmount } = React.useMemo(() => {
    const openInvoices = invoices.filter(i => isPaymentQueueRouted(i) && !['paid', 'auto_pay'].includes(i.payment_status) && i.status !== 'rejected');
    const appUnpaid = openInvoices.filter(isApprovedForPaymentQueue);
    const dueSum = appUnpaid.reduce((sum, i) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0);
    const paidSum = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0);
    const pending = payments.filter(p => p.status === 'pending').length;
    const now = new Date();
    const nextSeven = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const overdueRows = appUnpaid.filter(i => i.due_date && new Date(i.due_date) < now);
    const scheduledRows = appUnpaid.filter(i => i.scheduled_payment_date && i.status === 'scheduled');
    const partialRows = appUnpaid.filter(i => i.payment_status === 'partial' || i.status === 'partially_paid');
    return {
      approvedUnpaid: appUnpaid,
      totalDue: dueSum,
      totalPaid: paidSum,
      pendingPayments: pending,
      overdue: overdueRows.length,
      overdueAmount: overdueRows.reduce((sum, i) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0),
      scheduledInvoices: scheduledRows,
      scheduledAmount: scheduledRows.reduce((sum, i) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0),
      partialInvoices: partialRows,
      dueNextSevenAmount: appUnpaid
        .filter(i => i.due_date && new Date(i.due_date) <= nextSeven)
        .reduce((sum, i) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0),
    };
  }, [invoices, payments]);

  const openScheduleDialog = (invoice) => {
    setScheduleDialogInvoice(invoice);
    setScheduleForm({
      payment_account_id: invoice ? (invoice.payment_account_id || paymentAccounts[0]?.id || '') : (paymentAccounts[0]?.id || ''),
      scheduled_payment_date: invoice ? (invoice.scheduled_payment_date || invoice.due_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10)) : new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      payout_method: invoice?.ap_metadata?.scheduled_payout_method || paymentSettings.defaultPaymentMethod || 'stripe_connect_custom',
    });
  };

  const handleBulkSchedule = async () => {
    if (selectedInvoiceIds.length === 0) return;

    // Group selected invoices by vendor, as a single scheduled_payment should ideally be per-vendor
    const selected = invoices.filter(i => selectedInvoiceIds.includes(i.id));
    const vendors = [...new Set(selected.map(i => i.vendor_id))];

    if (vendors.length > 1) {
      toast.error('Please select invoices from a single vendor to schedule a batch payment.');
      return;
    }

    openScheduleDialog(null); // Open dialog in bulk mode
  };

  const submitSchedulePayment = async () => {
    const scheduleTarget = scheduleDialogInvoice
      ? `${scheduleDialogInvoice.vendor_name || 'this vendor'} invoice #${scheduleDialogInvoice.invoice_number}`
      : `${selectedInvoiceIds.length} selected invoices`;
    const ok = await confirm({
      title: 'Confirm schedule?',
      description: `This schedules a future automatic payment for ${scheduleTarget} on ${scheduleForm.scheduled_payment_date}.`,
      confirmLabel: 'Confirm Schedule',
      destructive: false,
    });
    if (!ok) return;
    setIsSubmittingSchedule(true);
    try {
      if (scheduleDialogInvoice) {
        // Single schedule
        await schedulePayment.mutateAsync({
          invoice: scheduleDialogInvoice,
          paymentAccountId: scheduleForm.payment_account_id,
          date: scheduleForm.scheduled_payment_date,
          payoutMethod: scheduleForm.payout_method
        });
      } else {
        // Bulk schedule
        const selected = invoices.filter(i => selectedInvoiceIds.includes(i.id));
        const amounts = selected.map(i => Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)));
        const vendorId = selected[0].vendor_id;

        const { error } = await supabase.rpc('schedule_payment_batch', {
          p_vendor_id: vendorId,
          p_payment_account_id: scheduleForm.payment_account_id,
          p_scheduled_date: scheduleForm.scheduled_payment_date,
          p_invoice_ids: selected.map(i => i.id),
          p_amounts: amounts
        });

        if (error) throw error;

        await Promise.all(selected.map((invoice) => supabase
          .from('invoices')
          .update({ ap_metadata: { ...(invoice.ap_metadata || {}), scheduled_payout_method: scheduleForm.payout_method } })
          .eq('id', invoice.id)
          .then(({ error: metadataError }) => { if (metadataError) throw metadataError; })
        ));

        queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
        setScheduleDialogInvoice(null);
        setSelectedInvoiceIds([]);
        toast.success(`Scheduled payment for ${selected.length} invoices`);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to schedule payments');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const openRecordDialog = (invoice) => {
    const remaining = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
    setRecordDialogInvoice(invoice);
    setRecordForm({
      amount: remaining.toFixed(2),
      reference: '',
      method: 'cheque',
    });
  };

  const [releasingInvoiceId, setReleasingInvoiceId] = useState(null);

  const openReleaseDialog = (invoice, payoutMethod = invoice?.ap_metadata?.scheduled_payout_method || 'stripe_connect_custom') => {
    setReleaseDialogInvoice(invoice);
    setReleaseForm({
      payment_account_id: invoice?.payment_account_id || '',
      payout_method: payoutMethod,
    });
  };

  const handleCardReleaseSuccess = async (paymentData) => {
    const invoice = releaseDialogInvoice;
    if (!invoice) return;
    const amount = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
    try {
      await recordInvoicePayment.mutateAsync({
        invoice,
        amount,
        reference: paymentData.transaction_id,
        method: 'stripe',
      });
      setReleaseDialogInvoice(null);
      toast.success('Funds released via Card');
    } catch (err) {
      toast.error(err.message || 'Card payment succeeded, but recording failed.');
    }
  };
  const submitReleaseFunds = async () => {
    const invoice = releaseDialogInvoice;
    if (!invoice) return;

    const selectedMethod = VENDOR_PAYOUT_METHODS.find((method) => method.value === releaseForm.payout_method);
    if (!selectedMethod) {
      toast.error('Select a valid payment rail.');
      return;
    }
    if (!selectedMethod.enabled) {
      toast.error(selectedMethod.label + ' payouts are not configured yet. Use ACH or check for vendor payments.');
      return;
    }
    if (!releaseForm.payment_account_id || releaseForm.payment_account_id === 'none') {
      toast.error('Select the operating payment account to fund this payout.');
      return;
    }

    const releaseOk = await confirm({
      title: 'Release funds?',
      description: `This releases $${Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)).toLocaleString()} to ${invoice.vendor_name || 'this vendor'} via ${selectedMethod.label}. This sends a real payout and cannot be undone.`,
      confirmLabel: 'Release Funds',
      destructive: true,
    });
    if (!releaseOk) return;

    setReleasingInvoiceId(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: {
          invoice_id: invoice.id,
          payout_method: selectedMethod.value,
          payment_account_id: releaseForm.payment_account_id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Funds released via ' + selectedMethod.label);
      setReleaseDialogInvoice(null);
      queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-payments'] });
    } catch (err) {
      toast.error(err.message || 'Failed to release funds');
    } finally {
      setReleasingInvoiceId(null);
    }
  };

  const handleConfirmBankTransfer = async (payment) => {
    const ok = await confirm({
      title: 'Confirm bank transfer?',
      description: `This marks the $${Number(payment.amount || 0).toLocaleString()} bank transfer from ${payment.vendor_name || 'this vendor'} as completed, marks the invoice paid, and writes the ledger entry.`,
      confirmLabel: 'Confirm',
      destructive: false,
    });
    if (!ok) return;
    try {
      const confirmedPayment = await confirmBankTransfer(payment.id, payment.organization_id || organization?.id);
      // Also update invoice to paid
      if (payment.invoice_id) {
        const fileDestination = await getVendorFileDestination(payment.vendor_id);

        await updateInvoice.mutateAsync({
          id: payment.invoice_id,
          data: { payment_status: 'paid', status: 'paid', file_destination: fileDestination },
        });
        let invoice = invoices.find(i => i.id === payment.invoice_id);
        if (!invoice) {
          try {
            invoice = await api.entities.Invoice.get(payment.invoice_id);
          } catch (e) {
            console.error('Failed to fetch invoice for ledger:', e);
          }
        }
        if (invoice) {
          await recordPaymentLedger({
            invoice: { ...invoice, organization_id: invoice.organization_id || organization?.id },
            paymentRecord: confirmedPayment || { ...payment, status: 'completed' },
            userId: userProfile?.id,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Bank transfer confirmed!');
    } catch (err) {
      toast.error('Failed to confirm: ' + err.message);
    }
  };

  const [retryingPaymentId, setRetryingPaymentId] = useState(null);

  const handleRetryPayment = async (payment) => {
    if (!payment.invoice_id) return toast.error('No invoice linked to this payment.');
    const ok = await confirm({
      title: 'Retry payment?',
      description: `This re-attempts a real payout of $${Number(payment.amount || 0).toLocaleString()} to ${payment.vendor_name || 'this vendor'}.`,
      confirmLabel: 'Retry',
      destructive: true,
    });
    if (!ok) return;
    setRetryingPaymentId(payment.id);
    try {
      const payoutMethod = ['stripe_connect_custom', 'checkbook_digital', 'checkbook_physical'].includes(payment.payment_method)
        ? payment.payment_method
        : payment.payment_method === 'check' || payment.payment_method === 'cheque'
          ? 'checkbook_digital'
          : 'stripe_connect_custom';
      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: { invoice_id: payment.invoice_id, payout_method: payoutMethod },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Payment retried successfully');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      invalidateInvoiceLists();
    } catch (err) {
      toast.error('Retry failed: ' + err.message);
    } finally {
      setRetryingPaymentId(null);
    }
  };

  const filteredInvoices = React.useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter === 'all') {
        return isPaymentQueueRouted(inv) && inv.payment_status !== 'paid' && inv.status !== 'paid';
      }
      return isPaymentQueueRouted(inv) && (inv.payment_status === statusFilter || inv.status === statusFilter);
    });
  }, [invoices, statusFilter]);

  const filteredPayments = React.useMemo(() => {
    if (paymentDateFilter === 'all') return payments;
    const cutoff = paymentDateFilter === '7d' ? subDays(new Date(), 7) : subMonths(new Date(), 1);
    return payments.filter((p) => p.payment_date && new Date(p.payment_date) >= cutoff);
  }, [payments, paymentDateFilter]);

  useEffect(() => {
    setInvoiceTableScrollTop(0);
    if (invoiceTableRef.current) invoiceTableRef.current.scrollTop = 0;
  }, [debouncedSearch, statusFilter, invoiceSortBy, organization?.id, (brand?.brand_id || brand?.id), location?.id]);

  useEffect(() => {
    setPaymentHistoryTableScrollTop(0);
    if (paymentHistoryTableRef.current) paymentHistoryTableRef.current.scrollTop = 0;
  }, [debouncedSearch, sortBy, paymentDateFilter, organization?.id, (brand?.brand_id || brand?.id), location?.id]);

  const invoiceWindow = React.useMemo(() => {
    const total = filteredInvoices.length;
    if (total === 0) {
      return {
        visibleInvoices: [],
        startIndex: 0,
        endIndex: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleCount = Math.ceil(PAYMENT_TABLE_VIEWPORT_HEIGHT / PAYMENT_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(invoiceTableScrollTop / PAYMENT_ROW_HEIGHT) - PAYMENT_ROW_OVERSCAN);
    const endIndex = Math.min(total, startIndex + visibleCount + (PAYMENT_ROW_OVERSCAN * 2));

    return {
      visibleInvoices: filteredInvoices.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop: startIndex * PAYMENT_ROW_HEIGHT,
      paddingBottom: Math.max(0, (total - endIndex) * PAYMENT_ROW_HEIGHT),
    };
  }, [filteredInvoices, invoiceTableScrollTop]);

  const paymentHistoryWindow = React.useMemo(() => {
    const total = filteredPayments.length;
    if (total === 0) {
      return {
        visiblePayments: [],
        startIndex: 0,
        endIndex: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleCount = Math.ceil(PAYMENT_TABLE_VIEWPORT_HEIGHT / PAYMENT_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(paymentHistoryTableScrollTop / PAYMENT_ROW_HEIGHT) - PAYMENT_ROW_OVERSCAN);
    const endIndex = Math.min(total, startIndex + visibleCount + (PAYMENT_ROW_OVERSCAN * 2));

    return {
      visiblePayments: filteredPayments.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop: startIndex * PAYMENT_ROW_HEIGHT,
      paddingBottom: Math.max(0, (total - endIndex) * PAYMENT_ROW_HEIGHT),
    };
  }, [filteredPayments, paymentHistoryTableScrollTop]);

  return (
    <div className="payment-visual-page space-y-6" string="progress">
      {/* Header */}
      <div className="payment-page-header flex items-center justify-between" string="progress">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-muted-foreground mt-1">Execute, schedule, and record vendor payments</p>
        </div>
        <Button variant="outline" onClick={() => setShowCreateCheck(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Write a Check
        </Button>
      </div>

      <CreateCheckDialog
        open={showCreateCheck}
        onClose={() => setShowCreateCheck(false)}
        organization={organization}
        brand={brand}
        confirm={confirm}
        location={location}
      />

      {/* Stats */}
      <div className="payment-stat-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" string="progress">
        <Card className="payment-stat-card border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Due</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  ${totalDue.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="payment-stat-card border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-resend-green mt-1">
                  ${totalPaid.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-resend-green/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-resend-green" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="payment-stat-card border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-resend-red mt-1">{overdue}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-resend-red/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-resend-red" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="payment-stat-card border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-resend-yellow mt-1">{pendingPayments}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-resend-yellow/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-resend-yellow" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card className="payment-filter-bar border-0 shadow-sm" string="progress">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor, invoice, or transaction..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {activeTab === 'invoices' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Unpaid Invoices</SelectItem>
                  <SelectItem value="approved">Approved (Unpaid)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="auto_pay">Auto-Pay</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="payment-tab-shell" string="progress">
        <div className="border-b border-border">
          <TabsList className="h-auto p-0 bg-transparent gap-6 justify-start w-full overflow-x-auto">
            <TabsTrigger value="invoices" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Payable Queue</TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Scheduled Payments</TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Payment History</TabsTrigger>
            <TabsTrigger value="reconciliation" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Reconciliation</TabsTrigger>
            <TabsTrigger value="setup" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Payment Setup</TabsTrigger>
            <TabsTrigger value="subscription" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Platform Subscription</TabsTrigger>
          </TabsList>
        </div>


        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4">
          <Card className="payment-table-shell border-0 shadow-sm" string="progress">
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle>All Invoices</CardTitle>
              {selectedInvoiceIds.length > 0 && (
                <Button onClick={handleBulkSchedule} size="sm" className="bg-primary hover:bg-primary">
                  <Clock className="w-4 h-4 mr-2" /> Schedule Selected ({selectedInvoiceIds.length})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div
                ref={invoiceTableRef}
                className="max-h-[648px] overflow-auto"
                onScroll={(event) => setInvoiceTableScrollTop(event.currentTarget.scrollTop)}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            filteredInvoices.filter(isApprovedForPaymentQueue).length > 0 &&
                            selectedInvoiceIds.length === filteredInvoices.filter(isApprovedForPaymentQueue).length
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedInvoiceIds(filteredInvoices.filter(isApprovedForPaymentQueue).map(i => i.id));
                            } else {
                              setSelectedInvoiceIds([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground group"
                        onClick={() => setInvoiceSortBy(invoiceSortBy === 'vendor_name' ? '-vendor_name' : 'vendor_name')}
                      >
                        <div className="flex items-center gap-1">
                          Vendor
                          <span className="opacity-0 group-hover:opacity-100 text-xs">
                            {invoiceSortBy === 'vendor_name' ? '^' : invoiceSortBy === '-vendor_name' ? 'v' : '-'}
                          </span>
                        </div>
                      </TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground group"
                        onClick={() => setInvoiceSortBy(invoiceSortBy === 'invoice_number' ? '-invoice_number' : 'invoice_number')}
                      >
                        <div className="flex items-center gap-1">
                          Invoice #
                          <span className="opacity-0 group-hover:opacity-100 text-xs">
                            {invoiceSortBy === 'invoice_number' ? '^' : invoiceSortBy === '-invoice_number' ? 'v' : '-'}
                          </span>
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground group"
                        onClick={() => setInvoiceSortBy(invoiceSortBy === 'due_date' ? '-due_date' : 'due_date')}
                      >
                        <div className="flex items-center gap-1">
                          Due Date
                          <span className="opacity-0 group-hover:opacity-100 text-xs">
                            {invoiceSortBy === 'due_date' ? '^' : invoiceSortBy === '-due_date' ? 'v' : '-'}
                          </span>
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground group"
                        onClick={() => setInvoiceSortBy(invoiceSortBy === 'total_amount' ? '-total_amount' : 'total_amount')}
                      >
                        <div className="flex items-center gap-1">
                          Amount
                          <span className="opacity-0 group-hover:opacity-100 text-xs">
                            {invoiceSortBy === 'total_amount' ? '^' : invoiceSortBy === '-total_amount' ? 'v' : '-'}
                          </span>
                        </div>
                      </TableHead>
                      <TableHead>Invoice Status</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                      {invoiceWindow.paddingTop > 0 && (
                        <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                          <TableCell colSpan={9} className="p-0" style={{ height: `${invoiceWindow.paddingTop}px` }} />
                        </TableRow>
                      )}
                      {invoiceWindow.visibleInvoices.map((invoice) => {
                        const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
                        const isOverdue = dueDate && dueDate < new Date() && !['paid', 'auto_pay'].includes(invoice.payment_status);
                        const isDueSoon = dueDate && !isOverdue && dueDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && !['paid', 'auto_pay'].includes(invoice.payment_status);
                        const isPayableRoute = isPaymentQueueRouted(invoice);
                        const apStatus = deriveApStatus(invoice);
                        const invoiceIsApproved = isApprovedForPaymentQueue(invoice);
                        const canPay = isPayableRoute && invoiceIsApproved && !['paid', 'auto_pay'].includes(invoice.payment_status);
                        const canSchedule = isPayableRoute && invoiceIsApproved && !['paid', 'auto_pay'].includes(invoice.payment_status);
                        const canRecord = isPayableRoute && invoiceIsApproved && !['paid', 'auto_pay'].includes(invoice.payment_status);

                        return (
                          <TableRow key={invoice.id}>
                            <TableCell>
                              {invoiceIsApproved && (
                                <Checkbox
                                  checked={selectedInvoiceIds.includes(invoice.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedInvoiceIds([...selectedInvoiceIds, invoice.id]);
                                    } else {
                                      setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== invoice.id));
                                    }
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                            <LocationCell row={invoice} />
                            <TableCell>{invoice.invoice_number}</TableCell>
                            <TableCell>
                              <span className={cn(
                                isOverdue && 'text-resend-red font-medium',
                                isDueSoon && 'text-resend-orange font-medium'
                              )}>
                                {dueDate ? format(dueDate, 'MMM d, yyyy') : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${invoice.total_amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={invoiceStatusColors[apStatus] || 'bg-secondary text-foreground'}>
                                {AP_STATUS_LABELS[apStatus] || apStatus?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isOverdue ? (
                                <Badge className="bg-resend-red/10 text-resend-red">Overdue</Badge>
                              ) : invoice.payment_status === 'paid' ? (
                                <Badge className="bg-primary/10 text-primary">Paid</Badge>
                              ) : invoice.payment_status === 'auto_pay' ? (
                                <Badge className="bg-purple-500/50/10 text-purple-400 border-purple-200">Auto-Pay</Badge>
                              ) : isDueSoon ? (
                                <Badge className="bg-resend-orange/10 text-resend-orange">Due Soon</Badge>
                              ) : (
                                <Badge variant="secondary">{invoice.payment_status || 'Unpaid'}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {canApproveFromPaymentQueue(invoice) && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(invoice)}
                                      className="bg-resend-green hover:bg-green-700 h-8 px-2"
                                    >
                                      <Check className="h-3 w-3 mr-1" /> Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReject(invoice)}
                                      className="border-red-300 text-resend-red hover:bg-resend-red/5 h-8 px-2"
                                    >
                                      <X className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  </>
                                )}
                                {canPay && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        size="sm"
                                        disabled={releasingInvoiceId === invoice.id}
                                        className="bg-primary hover:bg-primary h-8 px-3"
                                      >
                                        {releasingInvoiceId === invoice.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ArrowRightLeft className="h-3 w-3 mr-1" />}
                                        Release Funds
                                        <ChevronDown className="h-3 w-3 ml-1" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                      {VENDOR_PAYOUT_METHODS.map((method) => {
                                        const MethodIcon = method.icon;
                                        return (
                                          <DropdownMenuItem
                                            key={method.value}
                                            disabled={!method.enabled}
                                            onClick={() => openReleaseDialog(invoice, method.value)}
                                            className="flex items-start gap-2"
                                          >
                                            <MethodIcon className="mt-0.5 h-4 w-4" />
                                            <span className="flex min-w-0 flex-col">
                                              <span>{method.label}</span>
                                              <span className="text-xs text-muted-foreground">{method.detail}</span>
                                            </span>
                                          </DropdownMenuItem>
                                        );
                                      })}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                {canSchedule && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openScheduleDialog(invoice)}
                                    className="h-8 px-2"
                                  >
                                    <Clock className="h-3 w-3 mr-1" /> {invoice.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                                  </Button>
                                )}
                                {canRecord && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openRecordDialog(invoice)}
                                    className="h-8 px-2 border-green-300 text-resend-green hover:bg-resend-green/5"
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Record
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {invoiceWindow.paddingBottom > 0 && (
                        <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                          <TableCell colSpan={9} className="p-0" style={{ height: `${invoiceWindow.paddingBottom}px` }} />
                        </TableRow>
                      )}
                      </>
                    )}
                  </TableBody>
              </Table>
              </div>
              <div className="flex flex-col items-center gap-2 px-4 py-4 border-t text-sm text-muted-foreground sm:flex-row sm:justify-between">
                <span>
                  Showing rows {filteredInvoices.length === 0 ? 0 : invoiceWindow.startIndex + 1}
                  -{invoiceWindow.endIndex} of {filteredInvoices.length} invoices
                </span>
                {hasNextInvoicesPage && (
                  <Button variant="outline" onClick={() => fetchNextInvoicesPage()} disabled={isFetchingNextInvoicesPage}>
                    {isFetchingNextInvoicesPage ? 'Loading more...' : 'Load More Invoices'}
                  </Button>
                )}
              </div>
          </CardContent>
        </Card>
      </TabsContent>

        {/* Scheduled Payments Tab */}
        <TabsContent value="schedule" className="mt-4">
          <Card className="payment-table-shell border-0 shadow-sm" string="progress">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Scheduled Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div
                ref={paymentHistoryTableRef}
                className="max-h-[648px] overflow-auto"
                onScroll={(event) => setPaymentHistoryTableScrollTop(event.currentTarget.scrollTop)}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    <TableRow>
                      <TableHead>Scheduled Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Payment Account</TableHead>
                      <TableHead>Payment Rail</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No scheduled payments yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      scheduledInvoices.map((invoice) => {
                        const paymentAccount = paymentAccounts.find((account) => account.id === invoice.payment_account_id);
                        const remainingBalance = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
                        const scheduledDate = invoice.scheduled_payment_date ? new Date(invoice.scheduled_payment_date) : null;
                        const isPastScheduled = scheduledDate && scheduledDate < new Date();
                        return (
                          <TableRow key={invoice.id}>
                            <TableCell>
                              <span className={isPastScheduled ? 'text-resend-red font-medium' : ''}>
                                {scheduledDate ? format(scheduledDate, 'MMM d, yyyy') : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{invoice.vendor_name || '-'}</TableCell>
                            <LocationCell row={invoice} />
                            <TableCell>{invoice.invoice_number || '-'}</TableCell>
                            <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '-'}</TableCell>
                            <TableCell>{paymentAccount?.name || 'Unassigned'}</TableCell>
                            <TableCell>{PAYOUT_METHOD_LABELS[invoice.ap_metadata?.scheduled_payout_method] || 'Not selected'}</TableCell>
                            <TableCell className="font-semibold">${remainingBalance.toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge className={isPastScheduled ? 'bg-resend-red/10 text-resend-red' : 'bg-resend-yellow/10 text-resend-yellow'}>
                                {isPastScheduled ? 'Past Scheduled' : 'Scheduled'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => openScheduleDialog(invoice)} className="h-8">
                                  Reschedule
                                </Button>
                                <Button size="sm" onClick={() => openRecordDialog(invoice)} className="h-8 bg-resend-green hover:bg-green-700">
                                  Record Paid
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card className="payment-table-shell border-0 shadow-sm" string="progress">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Payment History
              </CardTitle>
              <Select value={paymentDateFilter} onValueChange={setPaymentDateFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="1m">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No payments recorded yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                      {paymentHistoryWindow.paddingTop > 0 && (
                        <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                          <TableCell colSpan={9} className="p-0" style={{ height: `${paymentHistoryWindow.paddingTop}px` }} />
                        </TableRow>
                      )}
                      {paymentHistoryWindow.visiblePayments.map((p) => {
                        const MethodIcon = paymentMethodIcons[p.payment_method] || Banknote;
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              {p.payment_date ? format(new Date(p.payment_date), 'MMM d, yyyy') : '-'}
                            </TableCell>
                            <TableCell className="font-medium">{p.vendor_name}</TableCell>
                            <LocationCell row={p} />
                            <TableCell>{p.invoice_number}</TableCell>
                            <TableCell>
                              <Badge className={paymentMethodColors[p.payment_method] || 'bg-secondary text-foreground'}>
                                <MethodIcon className="h-3 w-3 mr-1" />
                                {PAYOUT_METHOD_LABELS[p.payment_method] || p.payment_method?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {p.transaction_id?.slice(0, 20)}...
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${p.amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={paymentStatusColors[p.status] || 'bg-secondary text-foreground'}>
                                {p.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {p.status === 'pending' && p.payment_method === 'bank_transfer' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmBankTransfer(p)}
                                  className="bg-resend-green hover:bg-green-700 h-8 px-2"
                                >
                                  <ArrowRightLeft className="h-3 w-3 mr-1" /> Confirm
                                </Button>
                              )}
                              {p.status === 'failed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRetryPayment(p)}
                                  disabled={retryingPaymentId === p.id}
                                  className="h-8 px-2"
                                >
                                  {retryingPaymentId === p.id ? 'Retrying...' : 'Retry'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {paymentHistoryWindow.paddingBottom > 0 && (
                        <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                          <TableCell colSpan={9} className="p-0" style={{ height: `${paymentHistoryWindow.paddingBottom}px` }} />
                        </TableRow>
                      )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col items-center gap-2 px-4 py-4 border-t text-sm text-muted-foreground sm:flex-row sm:justify-between">
                <span>
                  Showing rows {filteredPayments.length === 0 ? 0 : paymentHistoryWindow.startIndex + 1}
                  -{paymentHistoryWindow.endIndex} of {filteredPayments.length} payments
                </span>
                {hasNextPaymentsPage && (
                  <Button variant="outline" onClick={() => fetchNextPaymentsPage()} disabled={isFetchingNextPaymentsPage}>
                    {isFetchingNextPaymentsPage ? 'Loading more...' : 'Load More Payments'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation Tab */}
        <TabsContent value="reconciliation" className="mt-4">
          <div className="space-y-6">
            {/* Open Invoices for Reconciliation */}
            <Card className="payment-table-shell border-0 shadow-sm" string="progress">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Open Invoices Awaiting Reconciliation
                </CardTitle>
                <p className="text-xs text-muted-foreground">Invoices that have been paid but not yet reconciled with bank statements</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.filter(p => p.status === 'completed').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No payments pending reconciliation
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.filter(p => p.status === 'completed').slice(0, 10).map(p => {
                        const MethodIcon = paymentMethodIcons[p.payment_method] || Banknote;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.vendor_name}</TableCell>
                            <LocationCell row={p} />
                            <TableCell>{p.invoice_number}</TableCell>
                            <TableCell className="font-semibold">${p.amount?.toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge className={paymentMethodColors[p.payment_method] || 'bg-secondary text-foreground'}>
                                <MethodIcon className="h-3 w-3 mr-1" />
                                {PAYOUT_METHOD_LABELS[p.payment_method] || p.payment_method?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.payment_date ? format(new Date(p.payment_date), 'MMM d, yyyy') : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-resend-green/10 text-resend-green">Paid</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => navigate('/Accounting?tab=reconciliation')}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Reconcile
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Email Tracked Invoices */}
            <Card className="payment-table-shell border-0 shadow-sm" string="progress">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-resend-blue" />
                  Email Awaiting
                </CardTitle>
                <p className="text-xs text-muted-foreground">Invoices received via email that need to be matched and processed</p>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No email invoices pending</p>
                  <p className="text-sm text-muted-foreground mt-1">Email invoices will appear here when the email integration is configured</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Setup Tab */}
        <TabsContent value="setup" className="mt-4">
          <div className="payment-setup-grid grid grid-cols-1 lg:grid-cols-2 gap-6" string="progress">
            {queryParams.get('banking') === 'skipped' && (
              <Card className="border-amber-500/40 bg-amber-500/10 shadow-sm lg:col-span-2">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                    <div>
                      <p className="font-semibold text-foreground">Bank setup was skipped during onboarding</p>
                      <p className="text-sm text-muted-foreground">Add an operating account here when you are ready to pay vendors through ACH or checks.</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('setup')}>Stay in setup</Button>
                </CardContent>
              </Card>
            )}

            <div className="lg:col-span-2">
              <PaymentAccountsSettings />
            </div>

            <Card className="payment-setup-card border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Payment Defaults
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Pay Approved Invoices</p>
                    <p className="text-sm text-muted-foreground">Automatically release approved invoices through the selected payout rail</p>
                  </div>
                  <Switch
                    checked={paymentSettings.autoPayApprovedInvoices}
                    onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, autoPayApprovedInvoices: checked })}
                  />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Pay Payment Rail</p>
                    <p className="text-sm text-muted-foreground">Rail used only when an auto-pay trigger runs</p>
                  </div>
                  <Select
                    value={['stripe_connect_custom', 'checkbook_digital', 'checkbook_physical'].includes(paymentSettings.defaultPaymentMethod) ? paymentSettings.defaultPaymentMethod : 'stripe_connect_custom'}
                    onValueChange={(value) => setPaymentSettings({ ...paymentSettings, defaultPaymentMethod: value })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe_connect_custom">ACH</SelectItem>
                      <SelectItem value="checkbook_digital">Digital Check</SelectItem>
                      <SelectItem value="checkbook_physical">Mailed Check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Payment Approval Threshold</p>
                    <p className="text-sm text-muted-foreground">Auto-pay limit without manual approval</p>
                  </div>
                  <Input
                    className="w-28"
                    type="number"
                    step="100"
                    value={paymentSettings.approvalThreshold}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, approvalThreshold: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Require Separate Approver</p>
                    <p className="text-sm text-muted-foreground">Block users from approving invoices they uploaded.</p>
                  </div>
                  <Switch
                    checked={paymentSettings.requireSeparateApprover}
                    onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, requireSeparateApprover: checked })}
                  />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Enforce Per-User Approval Limits</p>
                    <p className="text-sm text-muted-foreground">Use each user&apos;s invoice approval limit from User Management.</p>
                  </div>
                  <Switch
                    checked={paymentSettings.enforceApprovalLimits}
                    onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, enforceApprovalLimits: checked })}
                  />
                </div>
                <Button onClick={async () => {
                  const newlyEnablingAutoPay = paymentSettings.autoPayApprovedInvoices && !paymentSettingsRow?.settings?.autoPayApprovedInvoices;
                  const ok = await confirm({
                    title: 'Save payment settings?',
                    description: newlyEnablingAutoPay
                      ? 'This saves the org-wide payment settings and turns on Auto-Pay -- every approved invoice going forward will be paid automatically with no further review.'
                      : 'This saves the org-wide payment settings for this scope.',
                    confirmLabel: 'Save Payment Settings',
                    destructive: false,
                  });
                  if (!ok) return;
                  savePaymentSettings.mutate();
                }} disabled={savePaymentSettings.isPending} className="w-full bg-primary hover:bg-primary text-primary-foreground">
                  {savePaymentSettings.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save Payment Settings
                </Button>
              </CardContent>
            </Card>

            <Card className="payment-setup-card border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Payment Confirmation Email</p>
                    <p className="text-sm text-muted-foreground">Send email when payment is processed</p>
                  </div>
                  <Switch
                    checked={paymentSettings.confirmationEmail}
                    onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, confirmationEmail: checked })}
                  />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Overdue Invoice Alerts</p>
                    <p className="text-sm text-muted-foreground">Get notified when invoices become overdue</p>
                  </div>
                  <Switch
                    checked={paymentSettings.overdueAlerts}
                    onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, overdueAlerts: checked })}
                  />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Payment Summary</p>
                    <p className="text-sm text-muted-foreground">Receive a weekly digest of all payment activity</p>
                  </div>
                  <Switch
                    checked={paymentSettings.weeklySummary}
                    onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, weeklySummary: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="payment-setup-card border-0 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Due-Date Reminders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Remind me before invoices are due</p>
                    <p className="text-sm text-muted-foreground">Get notified in-app and by email when an unpaid invoice you can see crosses one of these day thresholds.</p>
                  </div>
                  <Switch
                    checked={reminderEnabled}
                    onCheckedChange={(checked) => saveReminderSettings.mutate({ reminder_days: reminderDays, enabled: checked })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {reminderDays.length === 0 && (
                    <p className="text-sm text-muted-foreground">No reminder days set.</p>
                  )}
                  {reminderDays.map(day => (
                    <Badge key={day} variant="outline" className="gap-1.5 py-1.5 pl-3 pr-2">
                      {day === 0 ? 'Due day' : `${day} day${day === 1 ? '' : 's'} before`}
                      <button
                        type="button"
                        onClick={() => handleRemoveReminderDay(day)}
                        className="hover:text-destructive"
                        aria-label={`Remove ${day}-day reminder`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Days"
                      className="w-20 h-8"
                      value={newReminderDay}
                      onChange={(e) => setNewReminderDay(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddReminderDay()}
                    />
                    <Button size="sm" variant="outline" className="h-8" onClick={handleAddReminderDay} disabled={!newReminderDay}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="mt-4">
          <Card className="payment-subscription-card border-0 shadow-sm max-w-2xl mx-auto overflow-hidden" string="progress">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-8 text-white relative">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-4 bg-card/10 backdrop-blur-md rounded-2xl border border-white/10">
                  <Sparkles className="w-8 h-8 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Platform Subscription</h2>
                  <p className="text-muted-foreground mt-1">Manage your Restops workspace plan and billing</p>
                </div>
              </div>
            </div>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="p-6 bg-secondary rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <h3 className="font-bold text-foreground text-lg">Billing Portal</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Update your payment methods, view past invoices, or change your subscription plan securely via Stripe.
                    </p>
                  </div>
                  <Button
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    className="bg-primary hover:bg-primary text-primary-foreground min-w-[180px] h-12 rounded-xl shadow-lg shadow-teal-600/20"
                  >
                    {portalLoading ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading Portal...</>
                    ) : (
                      <>Manage Billing <ExternalLink className="w-5 h-5 ml-2" /></>
                    )}
                  </Button>
                </div>

                <div className="bg-primary/5 border border-teal-100 rounded-xl p-4 text-sm text-teal-800">
                  <p className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Secure Payment Processing
                  </p>
                  <p className="mt-1 text-primary/80">
                    We use Stripe to manage all platform billing. Your credit card details are never stored on our servers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule Payment Dialog */}
      <Dialog open={scheduleDialogInvoice !== null || (selectedInvoiceIds.length > 0 && scheduleForm.scheduled_payment_date && !scheduleDialogInvoice)} onOpenChange={(open) => { if (!open) { setScheduleDialogInvoice(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Payment</DialogTitle>
            <DialogDescription>
              {scheduleDialogInvoice
                ? `Schedule payment for ${scheduleDialogInvoice?.vendor_name} invoice #${scheduleDialogInvoice?.invoice_number}`
                : `Schedule batch payment for ${selectedInvoiceIds.length} invoices`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Payment Account</Label>
              <Select
                value={scheduleForm.payment_account_id}
                onValueChange={(val) => setScheduleForm(prev => ({ ...prev, payment_account_id: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name} (...{acc.account_number_last4})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={scheduleForm.scheduled_payment_date}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_payment_date: e.target.value }))}
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Rail</Label>
              <Select
                value={scheduleForm.payout_method}
                onValueChange={(value) => setScheduleForm(prev => ({ ...prev, payout_method: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rail..." />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_PAYOUT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value} disabled={!method.enabled || method.schedulable === false}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogInvoice(null)}>Cancel</Button>
            <Button
              onClick={submitSchedulePayment}
              disabled={isSubmittingSchedule}
              className="bg-primary hover:bg-primary"
            >
              {isSubmittingSchedule ? 'Scheduling...' : 'Confirm Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!releaseDialogInvoice} onOpenChange={(open) => !open && setReleaseDialogInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Vendor Payment</DialogTitle>
            <DialogDescription>
              Select the operating account and payment rail before sending funds to the vendor. Vendor destination details stay on the vendor profile/provider connection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm md:grid-cols-[1.4fr_0.6fr]">
              <div>
                <p className="text-muted-foreground">Vendor destination</p>
                <p className="font-semibold">{releaseDialogInvoice?.vendor_name || '-'}</p>
                {(() => {
                  const vendor = paymentVendorById.get(releaseDialogInvoice?.vendor_id);
                  const address = formatVendorAddress(vendor);
                  return (
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {address ? <p>{address}</p> : <p>No vendor address on file.</p>}
                      {(vendor?.email || vendor?.phone) && <p>{[vendor.email, vendor.phone].filter(Boolean).join(' � ')}</p>}
                    </div>
                  );
                })()}
              </div>
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-semibold">${Math.max(0, Number(releaseDialogInvoice?.total_amount || 0) - Number(releaseDialogInvoice?.paid_amount || 0)).toLocaleString()}</p>
              </div>
            </div>
            {releaseForm.payout_method !== 'stripe_card' && (
              <div className="space-y-2">
                <Label>Payment Account</Label>
                <Select
                  value={releaseForm.payment_account_id}
                  onValueChange={(value) => setReleaseForm((prev) => ({ ...prev, payment_account_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select funding account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}{account.account_number_last4 ? ` (...${account.account_number_last4})` : ''}
                      </SelectItem>
                    ))}
                    {paymentAccounts.length === 0 && <SelectItem value="none" disabled>No active payment accounts found</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Payment Rail</Label>
              <Select
                value={releaseForm.payout_method}
                onValueChange={(value) => setReleaseForm((prev) => ({ ...prev, payout_method: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select rail..." />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_PAYOUT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value} disabled={!method.enabled}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              ACH and checks release from an operating account. Card charges the entered card and sends the funds to the vendor payment destination.
            </p>
          </div>
          {releaseForm.payout_method === 'stripe_card' ? (
            <>
              <div className="pb-2">
                <StripePaymentForm
                  amount={Math.max(0, Number(releaseDialogInvoice?.total_amount || 0) - Number(releaseDialogInvoice?.paid_amount || 0))}
                  invoiceId={releaseDialogInvoice?.id}
                  vendorName={releaseDialogInvoice?.vendor_name}
                  invoiceNumber={releaseDialogInvoice?.invoice_number}
                  metadata={{ payout_method: 'stripe_card' }}
                  buttonLabel={`Pay by Card $${Math.max(0, Number(releaseDialogInvoice?.total_amount || 0) - Number(releaseDialogInvoice?.paid_amount || 0)).toLocaleString()}`}
                  onSuccess={handleCardReleaseSuccess}
                  onError={(err) => toast.error(err?.message || 'Card payment failed')}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReleaseDialogInvoice(null)}>Cancel</Button>
              </DialogFooter>
            </>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setReleaseDialogInvoice(null)}>Cancel</Button>
              <Button
                className="bg-primary hover:bg-primary"
                disabled={!releaseForm.payment_account_id || releaseForm.payment_account_id === 'none' || releasingInvoiceId === releaseDialogInvoice?.id}
                onClick={submitReleaseFunds}
              >
                {releasingInvoiceId === releaseDialogInvoice?.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Release Funds
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!recordDialogInvoice} onOpenChange={(open) => !open && setRecordDialogInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a full or partial vendor payment made outside the payment gateway.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <div>
                <p className="text-muted-foreground">Invoice Total</p>
                <p className="font-semibold">${Number(recordDialogInvoice?.total_amount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Already Paid</p>
                <p className="font-semibold">${Number(recordDialogInvoice?.paid_amount || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Amount Paid</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={recordForm.amount}
                onChange={(event) => setRecordForm({ ...recordForm, amount: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={recordForm.method} onValueChange={(value) => setRecordForm({ ...recordForm, method: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheque">Paper Check Already Sent</SelectItem>
                  <SelectItem value="bank_transfer">ACH Already Sent Outside RestOps</SelectItem>
                  <SelectItem value="credit_card">Card Paid Outside RestOps</SelectItem>
                  <SelectItem value="cash">Cash / Other Manual Record</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference / Check Number</Label>
              <Input
                value={recordForm.reference}
                onChange={(event) => setRecordForm({ ...recordForm, reference: event.target.value })}
                placeholder="e.g. Check #1234 or bank confirmation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogInvoice(null)}>Cancel</Button>
            <Button
              className="bg-resend-green hover:bg-green-700"
              disabled={!recordForm.amount || !recordForm.reference.trim() || recordInvoicePayment.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Record payment?',
                  description: `This records a manual payment of $${recordForm.amount} against ${recordDialogInvoice?.vendor_name || 'this'} invoice #${recordDialogInvoice?.invoice_number || ''}. Make sure the payment was actually made outside RestOps before confirming.`,
                  confirmLabel: 'Record Payment',
                  destructive: false,
                });
                if (!ok) return;
                recordInvoicePayment.mutate({
                  invoice: recordDialogInvoice,
                  amount: recordForm.amount,
                  reference: recordForm.reference,
                  method: recordForm.method,
                });
              }}
            >
              {recordInvoicePayment.isPending ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <ConfirmDialog />
    </div>
  );
}

