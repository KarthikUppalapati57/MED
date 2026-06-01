import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
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
  Loader2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

const statusColors = {
  active: 'bg-resend-green/10 text-resend-green',
  inactive: 'bg-secondary text-foreground',
  blacklisted: 'bg-resend-red/10 text-resend-red',
};

export default function Vendors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'vendors';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
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
    file_routing_preference: 'storage'
  });

  const queryClient = useQueryClient();

  const { data: vendors = [], isLoading } = useAuthQuery({
    queryKey: ['vendors'],
    queryFn: () => api.entities.Vendor.list('-created_at'),
  });

  // â”€â”€ Realtime subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const channel = supabase.channel('vendors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        queryClient.invalidateQueries({ queryKey: ['vendors'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
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
      file_routing_preference: 'storage'
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
      file_routing_preference: vendor.file_routing_preference || 'storage'
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Vendor name is required');
      return;
    }

    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestionsOpen(true);

    try {
      const categories = [...new Set(vendors.flatMap(v => v.categories || []))];

      const localSuggestions = (categories.length ? categories : ['general']).slice(0, 3).map((cat, idx) => ({
        name: `Suggested ${cat} vendor ${idx + 1}`,
        specialty: `${cat} supplies`,
        estimated_rating: 4.5,
        reason: `Based on your existing spend in category "${cat}".`,
      }));

      setSuggestions(localSuggestions);
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

  // Stats
  const { totalSpent, activeVendors, totalOrders } = React.useMemo(() => {
    const spent = vendors.reduce((sum, v) => sum + (v.total_spent || 0), 0);
    const active = vendors.filter(v => v.status === 'active').length;
    const orders = vendors.reduce((sum, v) => sum + (v.total_orders || 0), 0);
    return { totalSpent: spent, activeVendors: active, totalOrders: orders };
  }, [vendors]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendors</h1>
          <p className="text-muted-foreground mt-1">Manage your vendor relationships</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSuggestions}>
            <Sparkles className="h-4 w-4 mr-2" />
            Suggestions
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-primary hover:bg-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <p className="text-sm text-muted-foreground">Total Orders</p>
            <p className="text-2xl font-bold text-foreground">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Spent</p>
            <p className="text-2xl font-bold text-foreground">${totalSpent.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">


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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No vendors found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVendors.map((vendor) => (
                    <TableRow key={vendor.id}>
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
                          <span className="font-medium">{vendor.rating?.toFixed(1) || 'N/A'}</span>
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
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(vendor)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteMutation.mutate(vendor.id)}
                              className="text-resend-red"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* â”€â”€ Vendor Items Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Last Purchase</TableHead>
                    <TableHead>Last Amount</TableHead>
                    <TableHead>Order Guide</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No vendor items available. Items will appear here once vendors have associated products.
                      </TableCell>
                    </TableRow>
                  ) : (
                    vendors.flatMap(vendor =>
                      (vendor.items || []).length > 0
                        ? (vendor.items || []).map((item, idx) => (
                            <TableRow key={`${vendor.id}-${idx}`}>
                              <TableCell className="font-medium">{vendor.name}</TableCell>
                              <TableCell>{item.vendor_item_name || item.name || 'â€”'}</TableCell>
                              <TableCell>{item.product_name || 'â€”'}</TableCell>
                              <TableCell><Badge variant="secondary">{item.category || 'â€”'}</Badge></TableCell>
                              <TableCell className="font-mono text-sm">{item.item_code || 'â€”'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {item.last_purchase_date ? new Date(item.last_purchase_date).toLocaleDateString() : 'â€”'}
                              </TableCell>
                              <TableCell className="font-semibold">${(item.last_purchase_amount || 0).toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge className={item.on_order_guide ? 'bg-resend-green/10 text-resend-green' : 'bg-secondary text-muted-foreground'}>
                                  {item.on_order_guide ? 'Active' : 'Inactive'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        : [<TableRow key={`${vendor.id}-empty`}>
                            <TableCell className="font-medium">{vendor.name}</TableCell>
                            <TableCell colSpan={7} className="text-muted-foreground italic">No items cataloged</TableCell>
                          </TableRow>]
                    )
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Vendor Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
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
                <Label>File Routing Preference</Label>
                <Select
                  value={formData.file_routing_preference}
                  onValueChange={(v) => setFormData({ ...formData, file_routing_preference: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="payments">Payments</SelectItem>
                  </SelectContent>
                </Select>
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
          </DialogHeader>

          {loadingSuggestions ? (
            <div className="py-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">Finding vendor suggestions...</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {suggestions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No suggestions available</p>
              ) : (
                suggestions.map((s, idx) => (
                  <div key={s.name || idx} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-sm text-muted-foreground">{s.specialty}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-medium">{s.estimated_rating?.toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{s.reason}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        setFormData({ ...formData, name: s.name });
                        setSuggestionsOpen(false);
                        setDialogOpen(true);
                      }}
                    >
                      Add as Vendor
                    </Button>
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
