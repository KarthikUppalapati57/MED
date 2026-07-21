import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { useConfirm } from '@/hooks/useConfirm';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Store,
  Phone,
  Mail,
  MapPin,
  Star,
  Sparkles,
  MoreVertical,
  Loader2,
  X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AP_ROUTING_OPTIONS, normalizeApRouting } from '@/lib/apRouting';
import { generateVendorSuggestions } from '@/lib/geminiService';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import VendorOnboardingWizard from '../../components/VendorOnboardingWizard';

const VendorStatementsTab = React.lazy(() => import('./VendorStatementsTab'));
const VendorDefaultSettingsTab = React.lazy(() => import('./VendorDefaultSettingsTab'));

const statusColors = {
  active: 'bg-resend-green/10 text-resend-green',
  inactive: 'bg-secondary text-foreground',
  blacklisted: 'bg-resend-red/10 text-resend-red',
};

const VENDOR_ROW_HEIGHT = 76;
const VENDOR_TABLE_VIEWPORT_HEIGHT = 608;
const VENDOR_ROW_OVERSCAN = 8;

function formatVendorHealthScore(vendor) {
  if (vendor?.health_score == null) return 'N/A';
  const score = Number(vendor.health_score);
  if (!Number.isFinite(score)) return 'N/A';
  return (score / 20).toFixed(1);
}

function VendorTabFallback() {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        Loading vendor section...
      </CardContent>
    </Card>
  );
}

export default function VendorList() {
  const { confirm, ConfirmDialog } = useConfirm();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const pathParts = routerLocation.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const activeTab = currentSubPath || 'vendors';

  const setActiveTab = (tab) => {
    navigate(`/Vendors/${tab}${routerLocation.search}`);
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const vendorTableRef = React.useRef(null);
  const [vendorTableScrollTop, setVendorTableScrollTop] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'USA',
    payment_terms: 'net_30',
    status: 'active',
    notes: '',
    whatsapp_number: '',
    file_routing_preference: 'storage',
    ap_routing_preference: 'payments',
    is_commissary_vendor: false,
    is_internal_transfer_vendor: false
  });

  const queryClient = useQueryClient();
  const { organization, brand, location, role, isPlatformAdmin } = useAuth();
  const isElevatedUser = isPlatformAdmin || role === 'tenant_super_admin' || role === 'org_manager' || role === 'admin';

  const { data, isLoading } = useAuthQuery({
    queryKey: ['vendors', organization?.id],
    queryFn: () => api.entities.Vendor.list('name', {
      limit: 500,
      select: 'id, organization_id, brand_id, location_id, name, email, status, total_spent, unpaid_ap, health_score, file_routing_preference, default_expense_category, default_payment_method, default_payment_account_id',
    }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });
  const vendors = data || [];

 // Realtime subscription 
  useEffect(() => {
    const channel = supabase.channel('vendors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        queryClient.invalidateQueries({ queryKey: ['vendors', organization?.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, organization?.id]);
  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Vendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor created');
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Vendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor updated');
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Vendor.delete(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['vendors'] });
      const previousVendors = queryClient.getQueryData(['vendors']);
      queryClient.setQueryData(['vendors'], (old) => 
        old ? old.filter(vendor => vendor.id !== deletedId) : []
      );
      return { previousVendors };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousVendors) {
        queryClient.setQueryData(['vendors'], context.previousVendors);
      }
      toast.error('Failed to delete vendor');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onSuccess: () => {
      toast.success('Vendor deleted');
    },
  });

  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleBulkDelete = async () => {
    if (!(await confirm({
      title: 'Delete selected vendors?',
      description: `This will delete ${selectedIds.size} vendor(s). This cannot be undone.`,
    }))) return;
    try {
      await Promise.all([...selectedIds].map(id => api.entities.Vendor.delete(id)));
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(`${selectedIds.size} vendor(s) deleted`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error('Failed to delete some vendors: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      country: 'USA',
      payment_terms: 'net_30',
      status: 'active',
      notes: '',
      whatsapp_number: '',
      file_routing_preference: 'storage',
      ap_routing_preference: 'payments',
      is_commissary_vendor: false,
      is_internal_transfer_vendor: false
    });
    setEditingVendor(null);
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name || '',
      contact_name: vendor.contact_name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      city: vendor.city || '',
      state: vendor.state || '',
      zip_code: vendor.zip_code || '',
      country: vendor.country || 'USA',
      payment_terms: vendor.payment_terms || 'net_30',
      status: vendor.status || 'active',
      notes: vendor.notes || '',
      whatsapp_number: vendor.whatsapp_number || '',
      file_routing_preference: vendor.file_routing_preference || 'storage',
      ap_routing_preference: normalizeApRouting(vendor.ap_routing_preference),
      is_commissary_vendor: !!vendor.is_commissary_vendor,
      is_internal_transfer_vendor: !!vendor.is_internal_transfer_vendor
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Vendor name is required');
      return;
    }

    const vendorPayload = {
      name: formData.name,
      contact_name: formData.contact_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      city: formData.city || null,
      state: formData.state || null,
      zip_code: formData.zip_code || null,
      country: formData.country || 'USA',
      payment_terms: formData.payment_terms || 'net_30',
      status: formData.status || 'active',
      notes: formData.notes || null,
      whatsapp_number: formData.whatsapp_number || null,
      file_routing_preference: formData.file_routing_preference || 'storage',
      ap_routing_preference: normalizeApRouting(formData.ap_routing_preference),
      is_commissary_vendor: formData.is_commissary_vendor,
      is_internal_transfer_vendor: formData.is_internal_transfer_vendor,
    };

    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, data: vendorPayload });
    } else {
      createMutation.mutate({
        ...vendorPayload,
        organization_id: organization?.id,
        brand_id: (brand?.brand_id || brand?.id) || null,
        location_id: location?.id || null,
      });
    }
  };

  const [suggestionsError, setSuggestionsError] = useState(null);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestionsOpen(true);
    setSuggestionsError(null);

    try {
      const result = await generateVendorSuggestions(vendors);
      setSuggestions(result?.suggestions || []);
    } catch (err) {
      setSuggestionsError(err.message);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const filteredVendors = React.useMemo(() => {
    const searchLower = search.toLowerCase();
    return vendors.filter(v => {
      const matchesSearch = !search || 
        v.name?.toLowerCase().includes(searchLower) ||
        v.email?.toLowerCase().includes(searchLower);
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vendors, search, statusFilter]);

  useEffect(() => {
    setVendorTableScrollTop(0);
    if (vendorTableRef.current) vendorTableRef.current.scrollTop = 0;
  }, [search, statusFilter, organization?.id, (brand?.brand_id || brand?.id), location?.id]);

  const vendorWindow = React.useMemo(() => {
    const total = filteredVendors.length;
    if (total === 0) {
      return {
        visibleVendors: [],
        startIndex: 0,
        endIndex: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleCount = Math.ceil(VENDOR_TABLE_VIEWPORT_HEIGHT / VENDOR_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(vendorTableScrollTop / VENDOR_ROW_HEIGHT) - VENDOR_ROW_OVERSCAN);
    const endIndex = Math.min(total, startIndex + visibleCount + (VENDOR_ROW_OVERSCAN * 2));

    return {
      visibleVendors: filteredVendors.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop: startIndex * VENDOR_ROW_HEIGHT,
      paddingBottom: Math.max(0, (total - endIndex) * VENDOR_ROW_HEIGHT),
    };
  }, [filteredVendors, vendorTableScrollTop]);

  // Stats
  const { totalSpent, activeVendors, totalOrders } = React.useMemo(() => {
    const spent = vendors.reduce((sum, v) => sum + (v.total_spent || 0), 0);
    const active = vendors.filter(v => v.status === 'active').length;
    const orders = vendors.reduce((sum, v) => sum + (v.total_orders || 0), 0);
    return { totalSpent: spent, activeVendors: active, totalOrders: orders };
  }, [vendors]);

  const { data: orgInvoices = [] } = useAuthQuery({
    queryKey: ['vendor_invoices_period', organization?.id],
    queryFn: () => api.entities.Invoice.list('-invoice_date', { select: 'invoice_date, total_amount' }),
    enabled: !!organization?.id,
  });

  const { data: allVendorItems = [] } = useAuthQuery({
    queryKey: ['all_vendor_items', organization?.id],
    queryFn: () => api.entities.VendorItem.list('vendor_item_name', {
      select: 'id, vendor_id, vendor_item_name, vendor_item_code, vendor_unit, default_price, last_price, on_order_guide',
    }),
    enabled: !!organization?.id,
  });

  const vendorItemsByVendor = React.useMemo(() => {
    const map = {};
    for (const item of allVendorItems) {
      if (!map[item.vendor_id]) map[item.vendor_id] = [];
      map[item.vendor_id].push(item);
    }
    return map;
  }, [allVendorItems]);

  const periodSpent = React.useMemo(() => {
    if (periodFilter === 'all') return totalSpent;
    const now = new Date();
    let range;
    if (periodFilter === 'this_period') {
      range = { start: startOfMonth(now), end: endOfMonth(now) };
    } else if (periodFilter === 'last_period') {
      const lastMonth = subMonths(now, 1);
      range = { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    } else {
      range = { start: startOfYear(now), end: endOfYear(now) };
    }
    return orgInvoices.reduce((sum, inv) => {
      if (!inv.invoice_date) return sum;
      return isWithinInterval(new Date(inv.invoice_date), range) ? sum + Number(inv.total_amount || 0) : sum;
    }, 0);
  }, [periodFilter, orgInvoices, totalSpent]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendors</h1>
          <p className="text-muted-foreground mt-1">Manage your vendor relationships</p>
        </div>
        <div className="flex gap-2">
          {isElevatedUser && (
            <Button variant="outline" onClick={() => setActiveTab('defaults')}>
              Configure Defaults
            </Button>
          )}
          <Button variant="outline" onClick={fetchSuggestions}>
            <Sparkles className="h-4 w-4 mr-2" />
            Suggestions
          </Button>
          <Button onClick={() => setOnboardingOpen(true)} className="bg-primary hover:bg-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Vendors</p>
            <p className="text-2xl font-bold text-foreground">{vendors.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-resend-green">{activeVendors}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground"># Vendor Items</p>
            <p className="text-2xl font-bold text-foreground">{allVendorItems.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Orders</p>
            <p className="text-2xl font-bold text-foreground">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground"># Invoices Processed</p>
            <p className="text-2xl font-bold text-foreground">{orgInvoices.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Purchased</p>
            <p className="text-2xl font-bold text-foreground">${periodSpent.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="vendor-items">Vendor Items</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          {isElevatedUser && <TabsTrigger value="defaults">Default Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="vendors" className="space-y-4">

      {/* Period Filters */}
      <div className="flex gap-2">
        {['all', 'this_period', 'last_period', 'this_year'].map(period => (
          <Button
            key={period}
            size="sm"
            variant={periodFilter === period ? 'default' : 'outline'}
            onClick={() => setPeriodFilter(period)}
            className={periodFilter === period ? 'bg-primary hover:bg-primary' : ''}
          >
            {period === 'all' ? 'All Time' : period === 'this_period' ? 'This Period' : period === 'last_period' ? 'Last Period' : 'This Year'}
          </Button>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div
            ref={vendorTableRef}
            className="max-h-[608px] overflow-auto"
            onScroll={(event) => setVendorTableScrollTop(event.currentTarget.scrollTop)}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={filteredVendors.length > 0 && selectedIds.size === filteredVendors.length}
                      onCheckedChange={(checked) => setSelectedIds(checked ? new Set(filteredVendors.map(v => v.id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No vendors found
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                  {vendorWindow.paddingTop > 0 && (
                    <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0" style={{ height: `${vendorWindow.paddingTop}px` }} />
                    </TableRow>
                  )}
                  {vendorWindow.visibleVendors.map((vendor) => (
                    <TableRow 
                      key={vendor.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(vendor.id) ? 'bg-primary/5' : ''}`}
                      onClick={() => navigate(`/Vendors/${vendor.id}`)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(vendor.id)}
                          onCheckedChange={() => toggleSelect(vendor.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Store className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{vendor.name}</p>
                            <p className="text-sm text-muted-foreground">{vendor.contact_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {vendor.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" /> {vendor.email}
                            </div>
                          )}
                          {vendor.phone && (
                            <div className="flex items-center gap-1 text-muted-foreground mt-1">
                              <Phone className="h-3 w-3" /> {vendor.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {vendor.city}, {vendor.state}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{formatVendorHealthScore(vendor)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        ${vendor.total_spent?.toLocaleString() || '0'}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[vendor.status]}>
                          {vendor.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={(event) => event.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenuItem onClick={() => handleEdit(vendor)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                if (await confirm({
                                  title: 'Delete vendor?',
                                  description: `This will permanently remove "${vendor.name}". This action cannot be undone.`,
                                })) {
                                  deleteMutation.mutate(vendor.id);
                                }
                              }}
                              className="text-resend-red"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {vendorWindow.paddingBottom > 0 && (
                    <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0" style={{ height: `${vendorWindow.paddingBottom}px` }} />
                    </TableRow>
                  )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-center px-4 py-4 border-t text-sm text-muted-foreground sm:justify-between">
            <span>
              Showing rows {filteredVendors.length === 0 ? 0 : vendorWindow.startIndex + 1}
              -{vendorWindow.endIndex} of {filteredVendors.length} vendors
            </span>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-teal-800">{selectedIds.size} item(s) selected</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={handleBulkDelete} className="text-resend-red border-red-300 hover:bg-resend-red/5">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
        </TabsContent>

 {/* Vendor Items Tab */}
        <TabsContent value="vendor-items">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Vendor Items Catalog</CardTitle>
                <p className="text-xs text-muted-foreground">Master list of all vendor catalog items across all vendors</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vendor Item Name</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Order Guide</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No vendor items available. Items will appear here once vendors have associated products.
                      </TableCell>
                    </TableRow>
                  ) : (
                    vendors.flatMap(vendor => {
                      const items = vendorItemsByVendor[vendor.id] || [];
                      return items.length > 0
                        ? items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{vendor.name}</TableCell>
                              <TableCell>{item.vendor_item_name}</TableCell>
                              <TableCell className="font-mono text-sm">{item.vendor_item_code || '-'}</TableCell>
                              <TableCell>{item.vendor_unit || '-'}</TableCell>
                              <TableCell className="font-semibold">${Number(item.last_price ?? item.default_price ?? 0).toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge className={item.on_order_guide ? 'bg-resend-green/10 text-resend-green' : 'bg-secondary text-muted-foreground'}>
                                  {item.on_order_guide ? 'Active' : 'Inactive'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        : [<TableRow key={`${vendor.id}-empty`}>
                            <TableCell className="font-medium">{vendor.name}</TableCell>
                            <TableCell colSpan={5} className="text-muted-foreground italic">No items cataloged</TableCell>
                          </TableRow>];
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statements Tab */}
        <TabsContent value="statements">
          <React.Suspense fallback={<VendorTabFallback />}>
            <VendorStatementsTab vendors={vendors} />
          </React.Suspense>
        </TabsContent>

        {/* Default Settings Tab */}
        {isElevatedUser && (
          <TabsContent value="defaults">
            <React.Suspense fallback={<VendorTabFallback />}>
              <VendorDefaultSettingsTab />
            </React.Suspense>
          </TabsContent>
        )}
      </Tabs>

      {/* Vendor Onboarding Wizard */}
      <VendorOnboardingWizard open={onboardingOpen} onOpenChange={setOnboardingOpen} />

      <ConfirmDialog />

      {/* Vendor Form Dialog (Edit Only) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Vendor Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input
                  value={formData.whatsapp_number}
                  onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Zip</Label>
                <Input
                  value={formData.zip_code}
                  onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select
                  value={formData.payment_terms}
                  onValueChange={(v) => setFormData({ ...formData, payment_terms: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    <SelectItem value="net_15">Net 15</SelectItem>
                    <SelectItem value="net_30">Net 30</SelectItem>
                    <SelectItem value="net_45">Net 45</SelectItem>
                    <SelectItem value="net_60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="blacklisted">Blacklisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>AP Invoice Routing</Label>
                <Select
                  value={formData.ap_routing_preference}
                  onValueChange={(v) => setFormData({
                    ...formData,
                    ap_routing_preference: v,
                    file_routing_preference: ['payments', 'storage', 'accounting'].includes(v) ? v : formData.file_routing_preference,
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AP_ROUTING_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                <Label className="cursor-pointer">Commissary Vendor</Label>
                <Switch
                  checked={formData.is_commissary_vendor}
                  onCheckedChange={(v) => setFormData({ ...formData, is_commissary_vendor: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                <Label className="cursor-pointer">Internal Transfer Vendor</Label>
                <Switch
                  checked={formData.is_internal_transfer_vendor}
                  onCheckedChange={(v) => setFormData({ ...formData, is_internal_transfer_vendor: v })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary">
              {editingVendor ? 'Update' : 'Create'} Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggestions Dialog */}
      <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Vendor Suggestions
            </DialogTitle>
            <p className="text-xs text-muted-foreground">Analysis of your existing vendor list, powered by Gemini.</p>
          </DialogHeader>

          {loadingSuggestions ? (
            <div className="py-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">Analyzing your vendor list...</p>
            </div>
          ) : suggestionsError ? (
            <p className="text-center text-muted-foreground py-8">{suggestionsError}</p>
          ) : (
            <div className="space-y-4 py-4">
              {suggestions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No suggestions available</p>
              ) : (
                suggestions.map((s, idx) => (
                  <div key={idx} className="p-4 border rounded-lg">
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                  </div>
                ))
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestionsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



