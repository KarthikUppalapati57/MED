import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/apiClient';
import { format } from 'date-fns';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Warehouse,
  TrendingDown,
  TrendingUp,
  MoreVertical,
  ShoppingCart,
  Download,
  X,
  Clock
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getFlattenedCOA, getCOALabel } from '@/lib/accountingConfig';

export default function Inventory() {
  const { isGroundStaff } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'inventory';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [wastageDialogOpen, setWastageDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [convertForm, setConvertForm] = useState({ fromUnit: '', toUnit: '', quantity: 0 });
  const [wastageForm, setWastageForm] = useState({ quantity: 0, unit: '', reason: 'spoiled', notes: '' });
  const [addForm, setAddForm] = useState({ product_name: '', accounting_category: '1210', current_quantity: 0, current_unit: 'ea', unit_cost: 0, par_level: 0, reorder_point: 0, location: '' });
  const [selectedIds, setSelectedIds] = useState(new Set());

  const queryClient = useQueryClient();

  const { data: inventory = [], isLoading } = useAuthQuery({
    queryKey: ['inventory'],
    queryFn: () => api.entities.Inventory.list(),
  });

  const { data: wastageLogs = [] } = useAuthQuery({
    queryKey: ['wastage'],
    queryFn: () => api.entities.WastageLog.list('-created_at', 50),
  });

  useEffect(() => {
    const channel = supabase.channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wastage_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['wastage'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Inventory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Inventory updated');
      setEditDialogOpen(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Inventory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Item added to inventory');
      setAddDialogOpen(false);
      setAddForm({ product_name: '', accounting_category: '1210', current_quantity: 0, current_unit: 'ea', unit_cost: 0, par_level: 0, reorder_point: 0, location: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Inventory.delete(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['inventory'] });
      const previousData = queryClient.getQueryData(['inventory']);
      queryClient.setQueryData(['inventory'], (old) => 
        old ? old.filter(item => item.id !== deletedId) : []
      );
      return { previousData };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['inventory'], context.previousData);
      }
      toast.error('Failed to delete');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onSuccess: () => {
      toast.success('Item removed from inventory');
    },
  });

  const createWastageMutation = useMutation({
    mutationFn: (data) => api.entities.WastageLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wastage'] });
      toast.success('Wastage logged');
      setWastageDialogOpen(false);
    },
  });

  // Stats
  const { totalItems, totalValue, lowStock, totalWastageValue } = React.useMemo(() => {
    const items = inventory.length;
    const value = inventory.reduce((sum, i) => sum + (i.current_value || 0), 0);
    const low = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
    const wastage = wastageLogs.reduce((sum, w) => sum + (w.value || 0), 0);
    return { totalItems: items, totalValue: value, lowStock: low, totalWastageValue: wastage };
  }, [inventory, wastageLogs]);

  // Group by category
  const byCategory = inventory.reduce((acc, item) => {
    const cat = item.accounting_category || 'Other';
    if (!acc[cat]) acc[cat] = { items: 0, value: 0 };
    acc[cat].items++;
    acc[cat].value += item.current_value || 0;
    return acc;
  }, {});

  const handleEdit = (item) => {
    setSelectedItem(item);
    setEditForm({
      product_name: item.product_name || '',
      accounting_category: item.accounting_category || '1210',
      current_quantity: item.current_quantity || 0,
      current_unit: item.current_unit || 'ea',
      unit_cost: item.unit_cost || 0,
      par_level: item.par_level || 0,
      reorder_point: item.reorder_point || 0,
      location: item.location || '',
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (item) => {
    if (confirm(`Remove "${item.product_name}" from inventory? This cannot be undone.`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleConvert = (item) => {
    setSelectedItem(item);
    setConvertForm({ fromUnit: item.current_unit || 'ea', toUnit: '', quantity: item.current_quantity || 0 });
    setConvertDialogOpen(true);
  };

  const handleLogWastage = (item) => {
    setSelectedItem(item);
    setWastageForm({ quantity: 0, unit: item.current_unit || 'ea', reason: 'spoiled', notes: '' });
    setWastageDialogOpen(true);
  };

  const saveEdit = () => {
    const value = editForm.current_quantity * editForm.unit_cost;
    updateMutation.mutate({
      id: selectedItem.id,
      data: {
        ...editForm,
        current_value: value,
        previous_quantity: selectedItem.current_quantity,
        previous_value: selectedItem.current_value,
        last_counted_date: new Date().toISOString().split('T')[0],
      }
    });
  };

  const saveAdd = () => {
    createMutation.mutate({
      ...addForm,
      product_id: `PRD-${Date.now()}`,
      current_value: addForm.current_quantity * addForm.unit_cost,
    });
  };

  const saveConvert = () => {
    // Simple conversion example - in real app would use conversion_rates
    const conversionRates = {
      'box_to_lb': 10,
      'lb_to_ea': 16,
      'case_to_ea': 24,
    };
    
    const key = `${convertForm.fromUnit}_to_${convertForm.toUnit}`;
    const rate = conversionRates[key] || 1;
    const newQty = convertForm.quantity * rate;
    
    updateMutation.mutate({
      id: selectedItem.id,
      data: {
        current_quantity: newQty,
        current_unit: convertForm.toUnit,
        previous_quantity: selectedItem.current_quantity,
      }
    });
    setConvertDialogOpen(false);
  };

  const saveWastage = () => {
    const value = wastageForm.quantity * (selectedItem.unit_cost || 0);
    createWastageMutation.mutate({
      product_id: selectedItem.product_id,
      product_name: selectedItem.product_name,
      quantity: wastageForm.quantity,
      unit: wastageForm.unit,
      value,
      reason: wastageForm.reason,
      notes: wastageForm.notes,
    });

    // Update inventory
    const newQty = Math.max(0, (selectedItem.current_quantity || 0) - wastageForm.quantity);
    updateMutation.mutate({
      id: selectedItem.id,
      data: { current_quantity: newQty }
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInventory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInventory.map(i => i.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected item(s)? This cannot be undone.`)) {
      Promise.all([...selectedIds].map(id => deleteMutation.mutateAsync(id))).then(() => {
        setSelectedIds(new Set());
        toast.success(`${selectedIds.size} item(s) deleted`);
      });
    }
  };

  const handleBulkOrder = async () => {
    if (selectedIds.size === 0) return;
    const selected = inventory.filter(i => selectedIds.has(i.id));
    const orderItems = selected.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      current_stock: item.current_quantity || 0,
      par_level: item.par_level || 10,
      suggested_quantity: Math.max(0, (item.par_level || 10) - (item.current_quantity || 0)),
      approved_quantity: Math.max(0, (item.par_level || 10) - (item.current_quantity || 0)),
      unit: item.current_unit || 'ea',
      unit_price: item.unit_cost || 0,
      total_price: Math.max(0, (item.par_level || 10) - (item.current_quantity || 0)) * (item.unit_cost || 0),
    }));
    await api.entities.AutoOrder.create({
      order_number: `ORD-${Date.now()}`,
      vendor_name: 'Multiple Vendors',
      status: 'pending_approval',
      items: orderItems,
      total_amount: orderItems.reduce((s, i) => s + i.total_price, 0),
      chat_history: [],
    });
    toast.success(`Order created for ${selectedIds.size} item(s) — check Auto Ordering`);
    setSelectedIds(new Set());
  };

  const handleExport = () => {
    const selected = selectedIds.size > 0
      ? inventory.filter(i => selectedIds.has(i.id))
      : filteredInventory;
    const headers = ['Product Name', 'Category', 'Quantity', 'Unit', 'Unit Cost', 'Value', 'Par Level', 'Reorder Point', 'Location'];
    const rows = selected.map(i => [
      i.product_name, i.accounting_category, i.current_quantity, i.current_unit,
      i.unit_cost, i.current_value, i.par_level, i.reorder_point, i.location
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredInventory = React.useMemo(() => {
    const searchLower = search.toLowerCase();
    return inventory.filter(item => {
      const matchesSearch = !search || 
        item.product_name?.toLowerCase().includes(searchLower);
      const matchesCategory = categoryFilter === 'all' || item.accounting_category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, search, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-500 mt-1">Track and manage stock levels</p>
        </div>
        {!isGroundStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            <Button onClick={() => setAddDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700">
              <Plus className="h-4 w-4 mr-2" /> Add Item
            </Button>
          </div>
        )}
      </div>

      {/* 24-Hour Pending Review Banner */}
      {(() => {
        const now = new Date();
        const pendingItems = inventory.filter(item => 
          item.pending_until && new Date(item.pending_until) > now
        );
        if (pendingItems.length === 0) return null;

        // Calculate time remaining for the earliest pending item
        const earliest = pendingItems.reduce((min, item) => {
          const d = new Date(item.pending_until);
          return d < min ? d : min;
        }, new Date(pendingItems[0].pending_until));
        const hoursLeft = Math.max(0, Math.ceil((earliest - now) / (1000 * 60 * 60)));

        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {pendingItems.length} item{pendingItems.length > 1 ? 's' : ''} pending review
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Recently approved invoice items are staged for {hoursLeft}h. You can edit quantities and details during this window before they finalize.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pendingItems.slice(0, 5).map(item => (
                  <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                    {item.product_name} ({item.current_quantity} {item.current_unit || 'ea'})
                    {item.pending_source_invoice ? ` • Inv: ${item.pending_source_invoice}` : ''}
                  </span>
                ))}
                {pendingItems.length > 5 && (
                  <span className="text-[10px] text-amber-500">+{pendingItems.length - 5} more</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Items</p>
                <p className="text-2xl font-bold text-slate-900">{totalItems}</p>
              </div>
              <Warehouse className="h-8 w-8 text-teal-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Value</p>
                <p className="text-2xl font-bold text-slate-900">${totalValue.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Low Stock</p>
                <p className="text-2xl font-bold text-red-600">{lowStock}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Wastage (MTD)</p>
                <p className="text-2xl font-bold text-orange-600">${totalWastageValue.toLocaleString()}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="summary">Inventory Summary</TabsTrigger>
          <TabsTrigger value="wastage">Wastage Log</TabsTrigger>
          <TabsTrigger value="counts">Inventory Counts</TabsTrigger>
          <TabsTrigger value="waste-summary">Waste Summary</TabsTrigger>
          <TabsTrigger value="count-sheets">Count Sheets</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          {/* Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search inventory..."
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
                    {getFlattenedCOA().map(coa => (
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
                <Button size="sm" variant="outline" onClick={handleBulkOrder}>
                  <ShoppingCart className="h-4 w-4 mr-1" /> Create Order
                </Button>
                <Button size="sm" variant="outline" onClick={handleExport}>
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

          {/* Inventory Table */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                   <TableRow>
                     <TableHead className="w-[40px]">
                       {!isGroundStaff && (
                         <Checkbox
                           checked={filteredInventory.length > 0 && selectedIds.size === filteredInventory.length}
                           onCheckedChange={toggleSelectAll}
                         />
                       )}
                     </TableHead>
                     <TableHead>Category</TableHead>
                     <TableHead>Item</TableHead>
                     <TableHead>Report By</TableHead>
                     <TableHead>Prev Count</TableHead>
                     <TableHead>Prev Value</TableHead>
                     <TableHead>Count</TableHead>
                     <TableHead>Value</TableHead>
                     <TableHead>Threshold</TableHead>
                     <TableHead>Change</TableHead>
                     <TableHead className="w-[60px]"></TableHead>
                   </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                          No inventory items found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInventory.map((item) => {
                        const change = (item.current_value || 0) - (item.previous_value || 0);
                        const isLow = item.current_quantity <= (item.reorder_point || 5);
                        
                        return (
                          <TableRow key={item.id} className={cn(isLow && "bg-red-50", selectedIds.has(item.id) && "bg-teal-50")}>
                             <TableCell>
                               {!isGroundStaff && (
                                 <Checkbox
                                   checked={selectedIds.has(item.id)}
                                   onCheckedChange={() => toggleSelect(item.id)}
                                 />
                               )}
                             </TableCell>
                             <TableCell>
                               <Badge variant="secondary" className="font-mono text-[10px]">
                                 {getCOALabel(item.accounting_category)}
                               </Badge>
                             </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.product_name}</span>
                                {isLow && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              </div>
                            </TableCell>
                            <TableCell>{item.current_unit}</TableCell>
                            <TableCell>{item.previous_quantity || 0}</TableCell>
                            <TableCell>${(item.previous_value || 0).toFixed(2)}</TableCell>
                            <TableCell className="font-semibold">{item.current_quantity || 0}</TableCell>
                             <TableCell className="font-semibold">${(item.current_value || 0).toFixed(2)}</TableCell>
                             <TableCell>
                               <div className="flex flex-col gap-0.5">
                                 <span className="text-xs text-slate-500">Par: <span className="font-medium text-slate-700">{item.par_level ?? '—'}</span></span>
                                 <span className="text-xs text-slate-500">Reorder: <span className={cn("font-medium", isLow ? "text-red-600" : "text-slate-700")}>{item.reorder_point ?? '—'}</span></span>
                               </div>
                             </TableCell>
                              <TableCell>
                               <span className={cn(
                                "font-medium",
                                change > 0 && "text-green-600",
                                change < 0 && "text-red-600"
                              )}>
                                {change > 0 ? '+' : ''}{change.toFixed(2)}
                              </span>
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
                                    <DropdownMenuItem onClick={() => handleEdit(item)}>
                                      <Edit2 className="h-4 w-4 mr-2" /> Edit Item
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConvert(item)}>
                                      <RefreshCw className="h-4 w-4 mr-2" /> Convert Unit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleLogWastage(item)}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Log Wastage
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-600">
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
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

        <TabsContent value="summary">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Inventory Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(byCategory).map(([category, data]) => (
                  <div key={category} className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-medium text-slate-900 font-mono text-xs mb-2">{getCOALabel(category)}</p>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-500">{data.items} items</span>
                      <span className="font-semibold">${data.value.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wastage">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Wastage Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wastageLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        No wastage logged
                      </TableCell>
                    </TableRow>
                  ) : (
                    wastageLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{format(new Date(log.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="font-medium">{log.product_name}</TableCell>
                        <TableCell>{log.quantity} {log.unit}</TableCell>
                        <TableCell className="text-red-600 font-semibold">${log.value?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{log.reason}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">{log.notes}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inventory Counts Tab ────────────────────────────── */}
        <TabsContent value="counts">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Inventory Counts</CardTitle>
              <Button className="bg-teal-600 hover:bg-teal-700" size="sm">
                <Plus className="h-4 w-4 mr-2" /> New Count
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Food</TableHead>
                    <TableHead>N/A Bev</TableHead>
                    <TableHead>Other</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Derive count snapshots from current inventory grouped by date
                    const today = new Date().toISOString().split('T')[0];
                    const foodValue = inventory.filter(i => i.accounting_category === 'food').reduce((s, i) => s + (i.current_value || 0), 0);
                    const bevValue = inventory.filter(i => i.accounting_category === 'beverage').reduce((s, i) => s + (i.current_value || 0), 0);
                    const otherValue = totalValue - foodValue - bevValue;
                    return (
                      <TableRow>
                        <TableCell className="font-medium">{format(new Date(), 'MMM d, yyyy')}</TableCell>
                        <TableCell><Badge variant="secondary">All</Badge></TableCell>
                        <TableCell><Badge className="bg-emerald-100 text-emerald-700">Current</Badge></TableCell>
                        <TableCell>${foodValue.toLocaleString()}</TableCell>
                        <TableCell>${bevValue.toLocaleString()}</TableCell>
                        <TableCell>${otherValue.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">${totalValue.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Waste Summary Tab ───────────────────────────────── */}
        <TabsContent value="waste-summary">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Waste Reasons */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Top Waste Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const byReason = wastageLogs.reduce((acc, w) => {
                    const reason = w.reason || 'other';
                    if (!acc[reason]) acc[reason] = { count: 0, value: 0 };
                    acc[reason].count++;
                    acc[reason].value += w.value || 0;
                    return acc;
                  }, {});
                  const sorted = Object.entries(byReason).sort((a, b) => b[1].value - a[1].value);
                  const maxValue = sorted.length > 0 ? sorted[0][1].value : 1;
                  return sorted.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">No waste data available</p>
                  ) : (
                    <div className="space-y-4">
                      {sorted.map(([reason, data]) => (
                        <div key={reason}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium capitalize">{reason.replace(/_/g, ' ')}</span>
                            <span className="text-slate-500">{data.count} entries · ${data.value.toFixed(2)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all"
                              style={{ width: `${(data.value / maxValue) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Most Expensive Waste Items */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Most Expensive Waste</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wastageLogs
                      .slice()
                      .sort((a, b) => (b.value || 0) - (a.value || 0))
                      .slice(0, 10)
                      .map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{log.product_name}</TableCell>
                          <TableCell>{log.quantity} {log.unit}</TableCell>
                          <TableCell className="text-red-600 font-semibold">${log.value?.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize">{log.reason?.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {wastageLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-slate-400">No waste data</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Waste Summary Stats */}
            <Card className="border-0 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Waste Trend Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="p-4 bg-red-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-600">${totalWastageValue.toFixed(2)}</p>
                    <p className="text-xs text-red-500 mt-1 font-medium">Total Waste Value</p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-600">{wastageLogs.length}</p>
                    <p className="text-xs text-orange-500 mt-1 font-medium">Waste Entries</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-amber-600">
                      {wastageLogs.length > 0 ? `$${(totalWastageValue / wastageLogs.length).toFixed(2)}` : '$0.00'}
                    </p>
                    <p className="text-xs text-amber-500 mt-1 font-medium">Avg Waste per Entry</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-slate-700">
                      {totalValue > 0 ? `${((totalWastageValue / totalValue) * 100).toFixed(1)}%` : '0%'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Waste as % of Inventory</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Count Sheets Tab ────────────────────────────────── */}
        <TabsContent value="count-sheets">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Items Added Today (new inventory received) */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Today's Received Items</CardTitle>
                <p className="text-xs text-slate-400">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const todayItems = inventory.filter(i =>
                        i.last_counted_date === today || i.created_at?.startsWith(today)
                      );
                      return todayItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                            No items received today
                          </TableCell>
                        </TableRow>
                      ) : (
                        todayItems.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell><Badge variant="secondary">{item.accounting_category}</Badge></TableCell>
                            <TableCell>{item.current_quantity}</TableCell>
                            <TableCell>{item.current_unit}</TableCell>
                            <TableCell className="font-semibold">${(item.current_value || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))
                      );
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Previous Inventory Snapshot */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Previous Inventory Snapshot</CardTitle>
                <p className="text-xs text-slate-400">Last recorded counts before today's changes</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Prev Count</TableHead>
                      <TableHead>Prev Value</TableHead>
                      <TableHead>Current Count</TableHead>
                      <TableHead>Δ Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.filter(i => i.previous_quantity != null && i.previous_quantity !== i.current_quantity).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                          No count changes recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      inventory
                        .filter(i => i.previous_quantity != null && i.previous_quantity !== i.current_quantity)
                        .map(item => {
                          const delta = (item.current_quantity || 0) - (item.previous_quantity || 0);
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.product_name}</TableCell>
                              <TableCell>{item.previous_quantity}</TableCell>
                              <TableCell>${(item.previous_value || 0).toFixed(2)}</TableCell>
                              <TableCell className="font-semibold">{item.current_quantity}</TableCell>
                              <TableCell>
                                <span className={cn("font-medium", delta > 0 && "text-green-600", delta < 0 && "text-red-600")}>
                                  {delta > 0 ? '+' : ''}{delta}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input
                value={editForm.product_name}
                onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editForm.accounting_category} onValueChange={(v) => setEditForm({ ...editForm, accounting_category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getFlattenedCOA().map(coa => (
                    <SelectItem key={coa.code} value={coa.code}>
                      {coa.code} - {coa.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Quantity</Label>
                <Input type="number" value={editForm.current_quantity} onChange={(e) => setEditForm({ ...editForm, current_quantity: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={editForm.current_unit} onChange={(e) => setEditForm({ ...editForm, current_unit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" value={editForm.unit_cost} onChange={(e) => setEditForm({ ...editForm, unit_cost: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Par Level</Label>
                <Input type="number" value={editForm.par_level} onChange={(e) => setEditForm({ ...editForm, par_level: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input type="number" value={editForm.reorder_point} onChange={(e) => setEditForm({ ...editForm, reorder_point: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-teal-600 hover:bg-teal-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input value={addForm.product_name} onChange={(e) => setAddForm({ ...addForm, product_name: e.target.value })} placeholder="e.g. Chicken Breast" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={addForm.accounting_category} onValueChange={(v) => setAddForm({ ...addForm, accounting_category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getFlattenedCOA().map(coa => (
                    <SelectItem key={coa.code} value={coa.code}>
                      {coa.code} - {coa.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" value={addForm.current_quantity} onChange={(e) => setAddForm({ ...addForm, current_quantity: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={addForm.current_unit} onChange={(e) => setAddForm({ ...addForm, current_unit: e.target.value })} placeholder="ea, lb, box..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" value={addForm.unit_cost} onChange={(e) => setAddForm({ ...addForm, unit_cost: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={addForm.location} onChange={(e) => setAddForm({ ...addForm, location: e.target.value })} placeholder="e.g. Walk-in Cooler" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Par Level</Label>
                <Input type="number" value={addForm.par_level} onChange={(e) => setAddForm({ ...addForm, par_level: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input type="number" value={addForm.reorder_point} onChange={(e) => setAddForm({ ...addForm, reorder_point: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAdd} className="bg-teal-600 hover:bg-teal-700">Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500">
              Convert {selectedItem?.product_name} from {selectedItem?.current_unit}
            </p>
            <div className="space-y-2">
              <Label>From Unit</Label>
              <Input value={convertForm.fromUnit} disabled />
            </div>
            <div className="space-y-2">
              <Label>To Unit</Label>
              <Select
                value={convertForm.toUnit}
                onValueChange={(v) => setConvertForm({ ...convertForm, toUnit: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ea">Each (ea)</SelectItem>
                  <SelectItem value="lb">Pound (lb)</SelectItem>
                  <SelectItem value="oz">Ounce (oz)</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="case">Case</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveConvert} className="bg-teal-600 hover:bg-teal-700">Convert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wastage Dialog */}
      <Dialog open={wastageDialogOpen} onOpenChange={setWastageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Wastage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500">
              Log wastage for {selectedItem?.product_name}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={wastageForm.quantity}
                  onChange={(e) => setWastageForm({ ...wastageForm, quantity: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={wastageForm.unit} disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select
                value={wastageForm.reason}
                onValueChange={(v) => setWastageForm({ ...wastageForm, reason: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="spoiled">Spoiled</SelectItem>
                  <SelectItem value="overproduction">Overproduction</SelectItem>
                  <SelectItem value="customer_return">Customer Return</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={wastageForm.notes}
                onChange={(e) => setWastageForm({ ...wastageForm, notes: e.target.value })}
                placeholder="Additional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWastageDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveWastage} className="bg-red-600 hover:bg-red-700">Log Wastage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}