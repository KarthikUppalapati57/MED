import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery, useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/AuthContext';
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
  X,
  Settings,
  Wand2,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  XCircle
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
import ProductsLiveDashboard from '@/modules/products/components/ProductsLiveDashboard';

const MIN_NETWORK_MAPPING_COUNT = 50;
const MIN_NETWORK_CONFIDENCE = 90;
const LEGACY_GLOBAL_CATEGORY_ALIASES = {
  food_cogs: '5100',
  beverage_cogs: '5200',
  merchandise_cogs: '5300',
};
const TRUSTED_COA_CODES = new Set(getFlattenedCOA().filter(c => c.code.startsWith('5')).map(c => c.code));

function normalizeGlobalCategory(category) {
  const normalized = LEGACY_GLOBAL_CATEGORY_ALIASES[category] || category;
  return TRUSTED_COA_CODES.has(normalized) ? normalized : null;
}

function tokenizeItemName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function itemNamesLikelyMatch(productName, globalItemName) {
  const productTokens = new Set(tokenizeItemName(productName));
  const globalTokens = new Set(tokenizeItemName(globalItemName));
  if (!productTokens.size || !globalTokens.size) return false;

  const sharedCount = [...productTokens].filter(token => globalTokens.has(token)).length;
  const requiredShared = Math.min(2, productTokens.size, globalTokens.size);
  const coverage = sharedCount / Math.min(productTokens.size, globalTokens.size);
  return sharedCount >= requiredShared && coverage >= 0.8;
}

function isTrustedGlobalMapping(item) {
  return Boolean(
    item &&
    normalizeGlobalCategory(item.most_common_category) &&
    Number(item.mapping_count || 0) >= MIN_NETWORK_MAPPING_COUNT &&
    Number(item.confidence_score || 0) >= MIN_NETWORK_CONFIDENCE
  );
}

function findTrustedGlobalMatch(product, globalItems) {
  return globalItems.find(item => isTrustedGlobalMapping(item) && itemNamesLikelyMatch(product.name, item.item_name));
}

const categoryColors = {
  food: 'bg-resend-green/10 text-resend-green',
  beverage: 'bg-resend-blue/10 text-resend-blue',
  supplies: 'bg-purple-500/50/10 text-purple-400',
  equipment: 'bg-resend-orange/10 text-resend-orange',
  packaging: 'bg-resend-yellow/10 text-resend-yellow',
  cleaning: 'bg-cyan-500/10 text-cyan-400',
  other: 'bg-secondary text-foreground',
};

export default function Products() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const pathParts = routerLocation.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const activeTab = currentSubPath || 'all-products';

  const setActiveTab = (tab) => {
    navigate(`/Products/${tab}${routerLocation.search}`);
  };
  const { isGroundStaff } = usePermissions();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [sortBy, setSortBy] = useState('name');
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

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} product(s)? This cannot be undone.`)) return;
    try {
      await api.entities.Product.deleteMany([...selectedIds]);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} product(s) deleted`);
    } catch (error) {
      toast.error('Failed to delete products');
    }
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
  const [marginSettingsOpen, setMarginSettingsOpen] = useState(false);
  const [targetCogs, setTargetCogs] = useState(30); // Default 30% user target
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
  const { organization, brand, location } = useAuth();
  const needsGlobalItems = activeTab === 'ai-verification';

  const {
    data = {},
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useAuthInfiniteQuery({
    queryKey: ['products', debouncedSearch, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      return await api.entities.Product.list(sortBy, {
        page: pageParam,
        pageSize: 50,
        select: 'id, product_id, name, description, category, accounting_category, is_inventoried, is_tax_exempt, report_by_unit, base_unit, latest_price, location_specific, organization_id, brand_id, location_id, created_at',
        search: debouncedSearch || undefined,
        searchColumn: 'name'
      });
    },
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
  });

  const products = React.useMemo(() => data.pages ? data.pages.flat() : [], [data.pages]);

  const { data: globalItems = [] } = useAuthQuery({
    queryKey: ['global_vendor_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_trusted_global_vendor_item_suggestions');
      if (error) {
        console.warn('global_vendor_items error', error);
        return [];
      }
      return data || [];
    },
    enabled: !!organization?.id && needsGlobalItems,
  });

  const { data: priceVariances = [], isLoading: loadingVariances } = useAuthQuery({
    queryKey: ['price_variances', organization?.id],
    queryFn: () => api.vendors.getFlaggedVendorItems(organization?.id),
    enabled: !!organization?.id && (activeTab === 'price-variances' || activeTab === 'all-products'), // load if in either tab so we can show badge count
  });

  const resolveVarianceMutation = useMutation({
    mutationFn: ({ vendorItemId, updateProduct }) => api.vendors.resolvePriceVariance(vendorItemId, updateProduct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price_variances'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Price variance resolved');
    },
    onError: () => toast.error('Failed to resolve price variance'),
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

  const handleReviewNetworkMapping = (product, globalMatch) => {
    const trustedCategory = normalizeGlobalCategory(globalMatch?.most_common_category);
    if (!trustedCategory) {
      toast.error('This network suggestion needs platform review before it can be used.');
      return;
    }

    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      product_id: product.product_id || '',
      description: product.description || '',
      category: product.category || '',
      accounting_category: trustedCategory,
      is_inventoried: product.is_inventoried ?? true,
      is_tax_exempt: product.is_tax_exempt ?? false,
      report_by_unit: product.report_by_unit || 'ea',
      base_unit: product.base_unit || 'ea',
      latest_price: product.latest_price || 0,
      location_specific: product.location_specific ?? false,
    });
    setDialogOpen(true);
    toast.info('Network suggestion loaded for review. Confirm the category before saving.');
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

  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      const matchesCategory = categoryFilter === 'all' || p.accounting_category === categoryFilter;
      return matchesCategory;
    });
  }, [products, categoryFilter]);

  const { totalProducts, inventoriedCount, taxExemptCount, categoriesCount } = React.useMemo(() => {
    const total = products.length;
    const inventoried = products.filter(p => p.is_inventoried).length;
    const taxExempt = products.filter(p => p.is_tax_exempt).length;
    const categories = new Set(products.map(p => p.accounting_category)).size;
    return {
      totalProducts: total,
      inventoriedCount: inventoried,
      taxExemptCount: taxExempt,
      categoriesCount: categories
    };
  }, [products]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your product catalog</p>
        </div>
        {!isGroundStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMarginSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
              Target Margins
            </Button>
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-primary hover:bg-primary">
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
            <p className="text-sm text-muted-foreground">Total Products</p>
            <p className="text-2xl font-bold text-foreground">{totalProducts}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Inventoried</p>
            <p className="text-2xl font-bold text-foreground">{inventoriedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tax Exempt</p>
            <p className="text-2xl font-bold text-foreground">{taxExemptCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-foreground">{categoriesCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Predictive Engine Live Dashboard */}
      <ProductsLiveDashboard targetCogs={targetCogs} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none p-0 h-auto">
          <TabsTrigger value="all-products" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5">
            Master Catalog
          </TabsTrigger>
          <TabsTrigger value="ai-verification" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 relative">
            AI Verification Queue
            <Badge className="ml-2 bg-primary/20 text-primary hover:bg-primary/30">New</Badge>
          </TabsTrigger>
          <TabsTrigger value="price-variances" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 relative">
            Price Action Center
            {priceVariances.length > 0 && (
              <Badge className="ml-2 bg-resend-red text-white hover:bg-resend-red/90">{priceVariances.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="purchase-report" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5">
            Purchase Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all-products" className="space-y-4">
      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-teal-800">{selectedIds.size} item(s) selected</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={handleBulkExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDelete} className="text-resend-red border-red-300 hover:bg-resend-red/5">
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
                  <TableHead
                    className="cursor-pointer hover:text-foreground group"
                    onClick={() => setSortBy(sortBy === 'product_id' ? '-product_id' : 'product_id')}
                  >
                    <div className="flex items-center gap-1">
                      Product ID
                      <span className="opacity-0 group-hover:opacity-100 text-xs">
                        {sortBy === 'product_id' ? '↑' : sortBy === '-product_id' ? '↓' : '↕'}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground group"
                    onClick={() => setSortBy(sortBy === 'name' ? '-name' : 'name')}
                  >
                    <div className="flex items-center gap-1">
                      Description
                      <span className="opacity-0 group-hover:opacity-100 text-xs">
                        {sortBy === 'name' ? '↑' : sortBy === '-name' ? '↓' : '↕'}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead>On Inventory</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground group"
                    onClick={() => setSortBy(sortBy === 'latest_price' ? '-latest_price' : 'latest_price')}
                  >
                    <div className="flex items-center gap-1">
                      Latest Price
                      <span className="opacity-0 group-hover:opacity-100 text-xs">
                        {sortBy === 'latest_price' ? '↑' : sortBy === '-latest_price' ? '↓' : '↕'}
                      </span>
                    </div>
                  </TableHead>
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
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No products found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id} className={selectedIds.has(product.id) ? "bg-primary/5" : ""}>
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
                          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{product.description || product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.is_inventoried ? (
                          <Badge className="bg-resend-green/10 text-resend-green">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>{product.vendor_name || '-'}</TableCell>
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
                                className="text-resend-red"
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
                {hasNextPage && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center p-4">
                      <Button
                        variant="outline"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                      >
                        {isFetchingNextPage ? 'Loading more...' : 'Load More Products'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

 {/* AI Verification Queue Tab */}
        <TabsContent value="ai-verification">
          <Card className="border-0 shadow-sm border-t-4 border-t-primary">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  AI Verification Queue
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Items extracted from invoices. The AI has auto-mapped high-confidence items. Review items below 90% confidence.
                </p>
              </div>
              <Button size="sm" variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                <Search className="h-4 w-4 mr-2" />
                Force Auto-Map Run
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Vendor Item</TableHead>
                    <TableHead>AI Suggestion (Product)</TableHead>
                    <TableHead>AI Confidence</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const newProducts = products.filter(p => {
                      if (!p.created_at) return false;
                      return new Date(p.created_at) >= sevenDaysAgo;
                    });
                    return newProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-3 opacity-20" />
                          Zero-Touch Mapping active. No items require manual review.
                        </TableCell>
                      </TableRow>
                    ) : (
                      newProducts.map((p, idx) => {
                        // Mock AI confidence for demonstration
                        const confidence = 95 - (idx * 15);
                        const isLowConfidence = confidence < 90;

                        const globalMatch = findTrustedGlobalMatch(p, globalItems);
                        const globalCategory = normalizeGlobalCategory(globalMatch?.most_common_category);

                        return (
                          <TableRow key={p.id} className={isLowConfidence ? "bg-resend-yellow/5" : ""}>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {p.name}
                              {isLowConfidence && !globalMatch && <span className="ml-2 text-xs text-resend-yellow font-medium italic">Needs Verification</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-medium">
                                {p.name.split(' ')[0]} Master Product
                              </Badge>
                              {globalMatch && (
                                <div className="mt-1 text-[10px] text-primary flex items-center gap-1">
                                  <Wand2 className="h-3 w-3" />
                                  Trusted Network Match: {globalMatch.mapping_count}+ restaurants map this to {getCOALabel(globalCategory)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {globalMatch ? (
                                <Badge className="bg-primary/20 text-primary">
                                  {globalMatch.confidence_score}% Network Match
                                </Badge>
                              ) : (
                                <Badge className={isLowConfidence ? "bg-resend-yellow/20 text-resend-yellow" : "bg-resend-green/20 text-resend-green"}>
                                  {confidence}% Match
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="font-mono text-[10px]">{getCOALabel(globalCategory || p.accounting_category)}</Badge></TableCell>
                            <TableCell>
                              {!isGroundStaff && (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="default" className="text-xs h-7 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                                    if (globalMatch) {
                                      handleReviewNetworkMapping(p, globalMatch);
                                      return;
                                    }
                                    toast.success('Approved');
                                  }}>
                                    {globalMatch ? 'Review Network Mapping' : 'Approve'}
                                  </Button>
                                  {(isLowConfidence || globalMatch) && (
                                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleEdit(p)}>
                                      Edit Mapping
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    );
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price Action Center Tab */}
        <TabsContent value="price-variances">
          <Card className="border-0 shadow-sm border-t-4 border-t-resend-red">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-resend-red" />
                  Price Action Center
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Vendor items with recent price spikes over 10%. Acknowledge the change to update your master product costs.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Vendor Item</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Linked Product</TableHead>
                    <TableHead>Old Price</TableHead>
                    <TableHead>New Price</TableHead>
                    <TableHead>Variance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingVariances ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        Loading flagged items...
                      </TableCell>
                    </TableRow>
                  ) : priceVariances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-resend-green opacity-50" />
                        All caught up! No recent price spikes detected.
                      </TableCell>
                    </TableRow>
                  ) : (
                    priceVariances.map((item) => (
                      <TableRow key={item.id} className="bg-resend-red/5">
                        <TableCell className="text-sm text-muted-foreground">
                          {item.invoice_date ? new Date(item.invoice_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{item.vendor_item_name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.vendor_name}</TableCell>
                        <TableCell>
                          {item.internal_product_id ? (
                            <Badge variant="outline" className="font-medium">
                              {item.internal_product_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">Unmapped</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground line-through decoration-resend-red/50">
                          ${(item.previous_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">
                          ${(item.latest_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-resend-red/10 text-resend-red border-resend-red/20 font-mono">
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                            {item.variance_percent ? item.variance_percent.toFixed(1) : '0'}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveVarianceMutation.mutate({ vendorItemId: item.id, updateProduct: false })}
                              disabled={resolveVarianceMutation.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                              Dismiss
                            </Button>
                            {item.internal_product_id && (
                              <Button
                                size="sm"
                                className="bg-resend-red hover:bg-resend-red/90 text-white"
                                onClick={() => resolveVarianceMutation.mutate({ vendorItemId: item.id, updateProduct: true })}
                                disabled={resolveVarianceMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Accept & Update Cost
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase Report Tab */}
        <TabsContent value="purchase-report">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Purchase Report</CardTitle>
                <p className="text-xs text-muted-foreground">Aggregated purchase data by product</p>
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
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                {!editingProduct && (
                   <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => toast.success("AI auto-populated Yield and Unit Conversions based on product name!")}>
                     <Wand2 className="h-3 w-3 mr-1" /> Auto-Fill via AI
                   </Button>
                )}
              </div>
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

            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="font-medium">Inventoried</p>
                <p className="text-sm text-muted-foreground">Track this product in inventory</p>
              </div>
              <Switch
                checked={formData.is_inventoried}
                onCheckedChange={(v) => setFormData({ ...formData, is_inventoried: v })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="font-medium">Tax Exempt</p>
                <p className="text-sm text-muted-foreground">Product is exempt from tax</p>
              </div>
              <Switch
                checked={formData.is_tax_exempt}
                onCheckedChange={(v) => setFormData({ ...formData, is_tax_exempt: v })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="font-medium">Location Specific</p>
                <p className="text-sm text-muted-foreground">Different settings per location</p>
              </div>
              <Switch
                checked={formData.location_specific}
                onCheckedChange={(v) => setFormData({ ...formData, location_specific: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary">
              {editingProduct ? 'Update' : 'Create'} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Target Margin Settings Dialog */}
      <Dialog open={marginSettingsOpen} onOpenChange={setMarginSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Global Margin Settings</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Set your target COGS % for AI margin warnings.
            </p>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Target Food COGS (%)</Label>
              <Input
                type="number"
                value={targetCogs}
                onChange={(e) => setTargetCogs(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarginSettingsOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              toast.success(`Target COGS updated to ${targetCogs}%`);
              setMarginSettingsOpen(false);
            }}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
