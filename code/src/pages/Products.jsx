import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/apiClient';
import {
  Plus,
  Search,
  Download,
  Edit2,
  Trash2,
  Package,
  MoreVertical,
  X
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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getFlattenedCOA, getCOALabel } from '@/lib/accountingConfig';

const categoryColors = {
  food: 'bg-green-100 text-green-700',
  beverage: 'bg-blue-100 text-blue-700',
  supplies: 'bg-purple-100 text-purple-700',
  equipment: 'bg-orange-100 text-orange-700',
  packaging: 'bg-yellow-100 text-yellow-700',
  cleaning: 'bg-cyan-100 text-cyan-700',
  other: 'bg-slate-100 text-slate-700',
};

export default function Products() {
  const { isGroundStaff } = usePermissions();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = (checked) => {
    setSelectedIds(checked ? new Set(filteredProducts.map(p => p.id)) : new Set());
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} product(s)? This cannot be undone.`)) return;
    Promise.all([...selectedIds].map(id => deleteMutation.mutateAsync(id))).then(() => {
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} product(s) deleted`);
    });
  };

  const handleBulkExport = () => {
    const selected = products.filter(p => selectedIds.has(p.id));
    const headers = ['Product ID', 'Name', 'Category', 'Accounting Category', 'Inventoried', 'Tax Exempt', 'Unit', 'Latest Price'];
    const rows = selected.map(p => [p.product_id, p.name, p.category, p.accounting_category, p.is_inventoried ? 'Yes' : 'No', p.is_tax_exempt ? 'Yes' : 'No', p.report_by_unit, p.latest_price]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_selected.csv';
    a.click();
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    product_id: '',
    description: '',
    category: '',
    accounting_category: 'food',
    is_inventoried: true,
    is_tax_exempt: false,
    report_by_unit: 'ea',
    base_unit: 'ea',
    latest_price: 0,
    location_specific: false,
  });

  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useAuthQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list('-created_at'),
  });

  useEffect(() => {
    const channel = supabase.channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created');
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Product.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated');
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Product.delete(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['products'] });
      const previousData = queryClient.getQueryData(['products']);
      queryClient.setQueryData(['products'], (old) => 
        old ? old.filter(item => item.id !== deletedId) : []
      );
      return { previousData };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['products'], context.previousData);
      }
      toast.error('Failed to delete');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onSuccess: () => {
      toast.success('Product deleted');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      product_id: '',
      description: '',
      category: '',
      accounting_category: '5110',
      is_inventoried: true,
      is_tax_exempt: false,
      report_by_unit: 'ea',
      base_unit: 'ea',
      latest_price: 0,
      location_specific: false,
    });
    setEditingProduct(null);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      product_id: product.product_id || '',
      description: product.description || '',
      category: product.category || '',
      accounting_category: product.accounting_category || '5110',
      is_inventoried: product.is_inventoried ?? true,
      is_tax_exempt: product.is_tax_exempt ?? false,
      report_by_unit: product.report_by_unit || 'ea',
      base_unit: product.base_unit || 'ea',
      latest_price: product.latest_price || 0,
      location_specific: product.location_specific ?? false,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Product name is required');
      return;
    }

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate({
        ...formData,
        product_id: formData.product_id || `PRD-${Date.now()}`
      });
    }
  };

  const exportToCSV = () => {
    const headers = ['Product ID', 'Name', 'Category', 'Accounting Category', 'Inventoried', 'Tax Exempt', 'Unit', 'Latest Price'];
    const rows = products.map(p => [
      p.product_id,
      p.name,
      p.category,
      p.accounting_category,
      p.is_inventoried ? 'Yes' : 'No',
      p.is_tax_exempt ? 'Yes' : 'No',
      p.report_by_unit,
      p.latest_price
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.csv';
    a.click();
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = !search || 
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.product_id?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.accounting_category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-slate-500 mt-1">Manage your product catalog</p>
        </div>
        {!isGroundStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-teal-600 hover:bg-teal-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total Products</p>
            <p className="text-2xl font-bold text-slate-900">{products.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Inventoried</p>
            <p className="text-2xl font-bold text-slate-900">
              {products.filter(p => p.is_inventoried).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Tax Exempt</p>
            <p className="text-2xl font-bold text-slate-900">
              {products.filter(p => p.is_tax_exempt).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Categories</p>
            <p className="text-2xl font-bold text-slate-900">
              {new Set(products.map(p => p.accounting_category)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all-products" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all-products">View All Products</TabsTrigger>
          <TabsTrigger value="new-review">New Item Review</TabsTrigger>
          <TabsTrigger value="purchase-report">Purchase Report</TabsTrigger>
        </TabsList>

        <TabsContent value="all-products" className="space-y-4">
      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {getFlattenedCOA().filter(c => c.code.startsWith('5')).map(coa => (
                  <SelectItem key={coa.code} value={coa.code}>
                    {coa.code} - {coa.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <span className="text-sm font-medium text-teal-800">{selectedIds.size} item(s) selected</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={handleBulkExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDelete} className="text-red-600 border-red-300 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    {!isGroundStaff && (
                      <Checkbox
                        checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    )}
                  </TableHead>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>On Inventory</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Latest Price</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      No products found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id} className={selectedIds.has(product.id) ? "bg-teal-50" : ""}>
                      <TableCell>
                        {!isGroundStaff && (
                          <Checkbox
                            checked={selectedIds.has(product.id)}
                            onCheckedChange={() => toggleSelect(product.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.product_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Package className="h-4 w-4 text-slate-500" />
                          </div>
                          <span className="font-medium">{product.description || product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.is_inventoried ? (
                          <Badge className="bg-green-100 text-green-700">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>{product.vendor_name || '—'}</TableCell>
                      <TableCell className="font-semibold">
                        ${product.latest_price?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        {!isGroundStaff && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(product)}>
                                <Edit2 className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => deleteMutation.mutate(product.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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

        {/* ── New Item Review Tab ──────────────────────────────── */}
        <TabsContent value="new-review">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">New Item Review</CardTitle>
              <p className="text-xs text-slate-400">Recently added products pending review and approval</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>On Inventory</TableHead>
                    <TableHead>Tax Exempt</TableHead>
                    <TableHead>Report By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Show products created in last 7 days as "new items"
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const newProducts = products.filter(p => {
                      if (!p.created_at) return false;
                      return new Date(p.created_at) >= sevenDaysAgo;
                    });
                    return newProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-slate-400">
                          No new products added in the last 7 days
                        </TableCell>
                      </TableRow>
                    ) : (
                      newProducts.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm text-slate-500">
                            {p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.vendor_name || '—'}</TableCell>
                          <TableCell><Badge variant="secondary" className="font-mono text-[10px]">{getCOALabel(p.accounting_category)}</Badge></TableCell>
                          <TableCell>{p.category || '—'}</TableCell>
                          <TableCell>
                            {p.is_inventoried ? <Badge className="bg-green-100 text-green-700">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                          </TableCell>
                          <TableCell>
                            {p.is_tax_exempt ? <Badge className="bg-amber-100 text-amber-700">Exempt</Badge> : <Badge variant="secondary">No</Badge>}
                          </TableCell>
                          <TableCell>{p.report_by_unit || 'ea'}</TableCell>
                          <TableCell>
                            {!isGroundStaff && (
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleEdit(p)}>
                                <Edit2 className="h-3 w-3 mr-1" /> Review
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    );
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Purchase Report Tab ──────────────────────────────── */}
        <TabsContent value="purchase-report">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Purchase Report</CardTitle>
                <p className="text-xs text-slate-400">Aggregated purchase data by product</p>
              </div>
              {!isGroundStaff && (
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Report By</TableHead>
                    <TableHead>Item Count</TableHead>
                    <TableHead>Latest Price</TableHead>
                    <TableHead>Avg Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                        No purchase data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell><Badge variant="secondary" className="font-mono text-[10px]">{getCOALabel(p.accounting_category)}</Badge></TableCell>
                        <TableCell>{p.category || '—'}</TableCell>
                        <TableCell>{p.report_by_unit || 'ea'}</TableCell>
                        <TableCell className="font-medium">{p.item_count || 1}</TableCell>
                        <TableCell className="font-semibold">${(p.latest_price || 0).toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">${(p.latest_price || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>
              <div className="space-y-2">
                <Label>Product ID</Label>
                <Input
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  placeholder="Auto-generated"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Produce, Dairy, Meat"
              />
            </div>

            <div className="space-y-2">
              <Label>Accounting Category</Label>
              <Select
                value={formData.accounting_category}
                onValueChange={(v) => setFormData({ ...formData, accounting_category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getFlattenedCOA().filter(c => c.code.startsWith('5')).map(coa => (
                    <SelectItem key={coa.code} value={coa.code}>
                      {coa.code} - {coa.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report By Unit</Label>
                <Input
                  value={formData.report_by_unit}
                  onChange={(e) => setFormData({ ...formData, report_by_unit: e.target.value })}
                  placeholder="ea, lb, oz"
                />
              </div>
              <div className="space-y-2">
                <Label>Latest Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.latest_price}
                  onChange={(e) => setFormData({ ...formData, latest_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium">Inventoried</p>
                <p className="text-sm text-slate-500">Track this product in inventory</p>
              </div>
              <Switch
                checked={formData.is_inventoried}
                onCheckedChange={(v) => setFormData({ ...formData, is_inventoried: v })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium">Tax Exempt</p>
                <p className="text-sm text-slate-500">Product is exempt from tax</p>
              </div>
              <Switch
                checked={formData.is_tax_exempt}
                onCheckedChange={(v) => setFormData({ ...formData, is_tax_exempt: v })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium">Location Specific</p>
                <p className="text-sm text-slate-500">Different settings per location</p>
              </div>
              <Switch
                checked={formData.location_specific}
                onCheckedChange={(v) => setFormData({ ...formData, location_specific: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
              {editingProduct ? 'Update' : 'Create'} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}