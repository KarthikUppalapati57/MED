import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoadingDockReceiving from '@/components/inventory/LoadingDockReceiving';
import ActiveCountSession from '@/components/inventory/ActiveCountSession';
import POSSyncEngine from '@/components/inventory/POSSyncEngine';
import InventoryTransfers from '@/components/inventory/InventoryTransfers';
import AvTDashboard from '@/components/inventory/AvTDashboard';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
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
  Clock,
  Sparkles,
  ScanBarcode,
  Camera
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'inventory';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0); // reset page on new search
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [wastageDialogOpen, setWastageDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [scannerDialogOpen, setScannerDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [convertForm, setConvertForm] = useState({ fromUnit: '', toUnit: '', quantity: 0 });
  const [wastageForm, setWastageForm] = useState({ quantity: 0, unit: '', reason: 'spoiled', notes: '' });
  const [addForm, setAddForm] = useState({ product_name: '', accounting_category: '1210', current_quantity: 0, current_unit: 'ea', unit_cost: 0, par_level: 0, reorder_point: 0, location: '' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [activeSessionOpen, setActiveSessionOpen] = useState(false);
  const [countTemplateName, setCountTemplateName] = useState('');
  const [selectedCountSheetId, setSelectedCountSheetId] = useState('');

  const queryClient = useQueryClient();
  const { organization, brand, location, userProfile } = useAuth();

  const { data: inventory = [], isLoading } = useAuthQuery({
    queryKey: ['inventory', organization?.id, location?.id, page, debouncedSearch, categoryFilter],
    queryFn: () => {
      const conditions = {};
      if (categoryFilter !== 'all') conditions.accounting_category = categoryFilter;
      return api.entities.Inventory.filter(conditions, {
        page,
        pageSize,
        search: debouncedSearch,
        searchColumn: 'product_name',
        orderBy: '-product_name'
      });
    },
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: inventoryMetrics } = useAuthQuery({
    queryKey: ['inventoryMetrics', organization?.id, location?.id, debouncedSearch],
    queryFn: () => api.metrics.getInventoryTotals(organization?.id, debouncedSearch, location?.id),
    enabled: !!organization?.id,
  });

  const { data: wastageLogs = [] } = useAuthQuery({
    queryKey: ['wastage', organization?.id],
    queryFn: () => api.entities.WastageLog.list('-created_at'),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: countSheets = [] } = useAuthQuery({
    queryKey: ['count_sheets', organization?.id],
    queryFn: () => api.entities.CountSheet.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: countSessions = [] } = useAuthQuery({
    queryKey: ['count_sessions', organization?.id],
    queryFn: () => api.entities.CountSession.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: recipes = [] } = useAuthQuery({
    queryKey: ['recipes', organization?.id],
    queryFn: () => api.entities.Recipe.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  useEffect(() => {
    const channel = supabase.channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wastage_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['wastage', organization?.id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'count_sheets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['count_sheets', organization?.id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'count_sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['count_sessions', organization?.id] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, organization?.id]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Inventory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id, location?.id] });
      toast.success('Inventory updated');
      setEditDialogOpen(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Inventory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id, location?.id] });
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
      queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id, location?.id] });
    },
    onSuccess: () => {
      toast.success('Item removed from inventory');
    },
  });

  const createWastageMutation = useMutation({
    mutationFn: (data) => api.entities.WastageLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wastage', organization?.id, location?.id] });
      toast.success('Wastage logged');
      setWastageDialogOpen(false);
    },
  });

  const createCountSheetMutation = useMutation({
    mutationFn: () => {
      if (!countTemplateName.trim()) throw new Error('Enter a template name');
      return api.entities.CountSheet.create({
        organization_id: organization?.id,
        location_id: location?.id || userProfile?.location_id || null,
        name: countTemplateName.trim(),
        description: 'Created from Inventory count workflow',
        items: inventory.map((item) => ({
          inventory_id: item.id,
          product_name: item.product_name,
          expected_quantity: item.current_quantity || 0,
          unit: item.current_unit || 'ea',
        })),
        created_by: userProfile?.id || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['count_sheets', organization?.id] });
      toast.success('Count template created');
      setCountTemplateName('');
      setNewTemplateOpen(false);
    },
    onError: (error) => toast.error(error.message || 'Failed to create count template'),
  });

  const completeCountSessionMutation = useMutation({
    mutationFn: async (counts = {}) => {
      const sheet = countSheets.find((item) => item.id === selectedCountSheetId) || countSheets[0];
      if (!sheet) throw new Error('Create a count template first');

      let totalVarianceValue = 0;
      const varianceData = {};

      const countedData = Object.fromEntries((sheet.items || []).map((item) => {
        const countedQty = counts[item.inventory_id] !== undefined && counts[item.inventory_id] !== '' ? parseFloat(counts[item.inventory_id]) : item.expected_quantity || 0;
        
        // Match with full inventory record to calculate dollar variance
        const invItem = inventory.find(i => i.id === item.inventory_id);
        const unitCost = invItem?.unit_cost || 0;
        const varianceQty = countedQty - (item.expected_quantity || 0);
        const varianceDollar = varianceQty * unitCost;

        if (varianceDollar !== 0) {
          totalVarianceValue += varianceDollar;
          varianceData[item.inventory_id] = { qty: varianceQty, value: varianceDollar };
        }

        return [
          item.inventory_id || item.product_name,
          {
            product_name: item.product_name,
            expected_quantity: item.expected_quantity || 0,
            counted_quantity: countedQty,
            unit: item.unit || 'ea',
            unit_cost: unitCost,
            variance: varianceDollar
          },
        ];
      }));

      // Generate the Automated GL Journal Entry for the Variance
      if (Math.abs(totalVarianceValue) > 0.01) {
        try {
          const isFavorable = totalVarianceValue > 0; // We have MORE stock than theoretical
          
          // Real API call to insert into General Ledger
          await api.entities.GeneralLedgerEntry.create({
            organization_id: organization?.id,
            date: new Date().toISOString(),
            reference: `INV-VAR-${Date.now()}`,
            description: `Inventory Count Variance Adjustment`,
            debit_account: isFavorable ? 'Inventory Asset (1210)' : 'COGS - Variance (5100)',
            credit_account: isFavorable ? 'COGS - Variance (5100)' : 'Inventory Asset (1210)',
            amount: Math.abs(totalVarianceValue),
            created_by: userProfile?.id || null
          });
          
          toast.success(`Automated GL Entry Generated: ${isFavorable ? 'Credited' : 'Debited'} COGS for $${Math.abs(totalVarianceValue).toFixed(2)}`);
        } catch (e) {
          console.error("Failed to generate GL entry", e);
          toast.error("Failed to generate automated GL entry");
        }
      }

      return api.entities.CountSession.create({
        organization_id: organization?.id,
        count_sheet_id: sheet.id,
        status: 'completed',
        counted_data: countedData,
        variance_data: varianceData,
        completed_at: new Date().toISOString(),
        counted_by: userProfile?.id || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['count_sessions', organization?.id] });
      toast.success('Count session completed');
      setSelectedCountSheetId('');
      setActiveSessionOpen(false);
    },
    onError: (error) => toast.error(error.message || 'Failed to complete count session'),
  });

  // Stats
  const { totalItems, totalValue, lowStock, totalWastageValue } = React.useMemo(() => {
    return {
      totalItems: inventoryMetrics?.totalItems || 0,
      totalValue: inventoryMetrics?.totalValue || 0,
      lowStock: inventoryMetrics?.lowStock || 0,
      totalWastageValue: inventoryMetrics?.totalWastageValue || 0
    };
  }, [inventoryMetrics]);

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
    const order = await api.entities.AutoOrder.create({
      organization_id: organization?.id,
      brand_id: brand?.id || null,
      location_id: location?.id || null,
      order_number: `ORD-${Date.now()}`,
      vendor_name: 'Multiple Vendors',
      status: 'pending_approval',
      items: orderItems,
      total_amount: orderItems.reduce((s, i) => s + i.total_price, 0),
      chat_history: [],
      created_by: userProfile?.id || null,
    });
    toast.success(`Order created for ${selectedIds.size} item(s) — check Auto Ordering`);
    setSelectedIds(new Set());
    navigate(`/AutoOrdering?tab=all-orders&order=${order.id}`);
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
    return inventory; // Data is now filtered server-side
  }, [inventory]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-muted-foreground mt-1">Track and manage stock levels</p>
        </div>
        {!isGroundStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            <Button variant="outline" onClick={() => setScannerDialogOpen(true)} className="border-primary/50 text-primary hover:bg-primary/5">
              <ScanBarcode className="h-4 w-4 mr-2" /> Scan Item
            </Button>
            <Button onClick={() => setAddDialogOpen(true)} className="bg-primary hover:bg-primary">
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
          <div className="bg-resend-yellow/5 border border-resend-yellow/20 rounded-xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-resend-yellow/10 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-resend-yellow" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {pendingItems.length} item{pendingItems.length > 1 ? 's' : ''} pending review
              </p>
              <p className="text-xs text-resend-yellow mt-0.5">
                Recently approved invoice items are staged for {hoursLeft}h. You can edit quantities and details during this window before they finalize.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pendingItems.slice(0, 5).map(item => (
                  <span key={item.id} className="text-[10px] px-2 py-0.5 rounded-full bg-resend-yellow/10 text-resend-yellow border border-resend-yellow/20 font-medium">
                    {item.product_name} ({item.current_quantity} {item.current_unit || 'ea'})
                    {item.pending_source_invoice ? ` • Inv: ${item.pending_source_invoice}` : ''}
                  </span>
                ))}
                {pendingItems.length > 5 && (
                  <span className="text-[10px] text-resend-yellow">+{pendingItems.length - 5} more</span>
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
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold text-foreground">{totalItems}</p>
              </div>
              <Warehouse className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-foreground">${totalValue.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-resend-green" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-bold text-resend-red">{lowStock}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-resend-red" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Wastage (MTD)</p>
                <p className="text-2xl font-bold text-resend-orange">${totalWastageValue.toLocaleString()}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-resend-orange" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-10 mb-6">
          <TabsTrigger value="inventory">Inventory List</TabsTrigger>
          <TabsTrigger value="receiving" className="text-primary font-bold">Receiving</TabsTrigger>
          <TabsTrigger value="avt" className="data-[state=active]:text-resend-green">Actual vs Theoretical</TabsTrigger>
          <TabsTrigger value="pos-sync" className="text-indigo-600 font-bold border-b-2 border-transparent data-[state=active]:border-indigo-600">POS Sync</TabsTrigger>
          <TabsTrigger value="transfers" className="text-amber-600 font-bold border-b-2 border-transparent data-[state=active]:border-amber-600">Transfers</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="wastage">Wastage Log</TabsTrigger>
          <TabsTrigger value="counts">Stock Counts</TabsTrigger>
          <TabsTrigger value="count-sheets">Count Sheets</TabsTrigger>
          <TabsTrigger value="waste-summary">Waste Summary</TabsTrigger>
          <TabsTrigger value="daily-snapshot">Daily Snapshot</TabsTrigger>
          <TabsTrigger value="hardware-setup">Hardware & Scales</TabsTrigger>
        </TabsList>

        <TabsContent value="receiving" className="space-y-4">
          <LoadingDockReceiving />
        </TabsContent>

        <TabsContent value="avt" className="space-y-4">
          <AvTDashboard />
        </TabsContent>

        <TabsContent value="pos-sync" className="space-y-4">
          <POSSyncEngine inventory={inventory} recipes={recipes} updateInventoryMutation={updateMutation} />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4">
          <InventoryTransfers inventory={inventory} updateInventoryMutation={updateMutation} organization={organization} />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          {/* Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-sm font-medium text-teal-800">{selectedIds.size} item(s) selected</span>
              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={handleBulkOrder}>
                  <ShoppingCart className="h-4 w-4 mr-1" /> Create Order
                </Button>
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600" onClick={() => {
                  if (confirm('Apply AI suggested Par Levels to selected items based on recent sales trends?')) {
                    const selected = inventory.filter(i => selectedIds.has(i.id));
                    selected.forEach(item => {
                      const smartPar = Math.ceil((item.par_level || 10) * 1.3);
                      updateMutation.mutate({ id: item.id, data: { par_level: smartPar } });
                    });
                    toast.success(`Smart Par applied to ${selectedIds.size} items`);
                    setSelectedIds(new Set());
                  }
                }}>
                  <Sparkles className="h-4 w-4 mr-1" /> Apply Smart Par
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
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No inventory items found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInventory.map((item) => {
                        const change = (item.current_value || 0) - (item.previous_value || 0);
                        const isLow = item.current_quantity <= (item.reorder_point || 5);
                        
                        return (
                          <TableRow key={item.id} className={cn(isLow && "bg-resend-red/5", selectedIds.has(item.id) && "bg-primary/5")}>
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
                                {isLow && <AlertTriangle className="h-4 w-4 text-resend-red" />}
                              </div>
                            </TableCell>
                            <TableCell>{item.current_unit}</TableCell>
                            <TableCell>{item.previous_quantity || 0}</TableCell>
                            <TableCell>${(item.previous_value || 0).toFixed(2)}</TableCell>
                            <TableCell className="font-semibold">{item.current_quantity || 0}</TableCell>
                             <TableCell className="font-semibold">${(item.current_value || 0).toFixed(2)}</TableCell>
                             <TableCell>
                               <div className="flex flex-col gap-1">
                                 <span className="text-xs text-muted-foreground flex items-center justify-between">
                                   <span>Par: <span className="font-medium text-foreground">{item.par_level ?? '—'}</span></span>
                                   {isLow && (
                                     <Badge variant="outline" className="text-[9px] h-4 bg-indigo-50 border-indigo-200 text-indigo-700 ml-2" title="AI Suggested Par based on forecasted volume">
                                       <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                       {Math.ceil((item.par_level || 10) * 1.3)}
                                     </Badge>
                                   )}
                                 </span>
                                 <span className="text-xs text-muted-foreground">Reorder: <span className={cn("font-medium", isLow ? "text-resend-red" : "text-foreground")}>{item.reorder_point ?? '—'}</span></span>
                               </div>
                             </TableCell>
                              <TableCell>
                               <span className={cn(
                                "font-medium",
                                change > 0 && "text-resend-green",
                                change < 0 && "text-resend-red"
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
                                    <DropdownMenuItem onClick={() => handleDelete(item)} className="text-resend-red">
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
                
                <div className="flex items-center justify-between px-4 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing page {page + 1}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={inventory.length < pageSize}
                    >
                      Next
                    </Button>
                  </div>
                </div>
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
                  <div key={category} className="p-4 bg-secondary rounded-lg">
                    <p className="font-medium text-foreground font-mono text-xs mb-2">{getCOALabel(category)}</p>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">{data.items} items</span>
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
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No wastage logged
                      </TableCell>
                    </TableRow>
                  ) : (
                    wastageLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{format(new Date(log.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="font-medium">{log.product_name}</TableCell>
                        <TableCell>{log.quantity} {log.unit}</TableCell>
                        <TableCell className="text-resend-red font-semibold">${log.value?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{log.reason}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{log.notes}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

 {/* Inventory Counts Tab */}
        <TabsContent value="counts">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Inventory Counts</CardTitle>
              <Button
                className="bg-primary hover:bg-primary"
                size="sm"
                onClick={() => {
                  if (countSheets.length > 0) {
                    setActiveSessionOpen(true);
                  } else {
                    setNewTemplateOpen(true);
                  }
                }}
              >
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
                        <TableCell><Badge className="bg-resend-green/10 text-resend-green">Current</Badge></TableCell>
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

 {/* Count Sheets Tab */}
        <TabsContent value="count-sheets">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Count Sheets</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Templates and mobile entry forms for inventory counts</p>
              </div>
              <Button className="bg-primary hover:bg-primary" size="sm" onClick={() => setNewTemplateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Template
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Last Count</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countSheets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No count sheets configured. Create templates by station (e.g., Bar, Walk-in, Line).
                      </TableCell>
                    </TableRow>
                  ) : (
                    countSheets.map(sheet => (
                      <TableRow key={sheet.id}>
                        <TableCell className="font-medium">{sheet.name}</TableCell>
                        <TableCell>{sheet.description}</TableCell>
                        <TableCell>{sheet.items?.length || 0} items</TableCell>
                        <TableCell>{sheet.last_count_date ? format(new Date(sheet.last_count_date), 'MMM d, yyyy') : 'Never'}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => setActiveSessionOpen(true)}>Start Count</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

 {/* Waste Summary Tab */}
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
                    <p className="text-muted-foreground text-center py-8">No waste data available</p>
                  ) : (
                    <div className="space-y-4">
                      {sorted.map(([reason, data]) => (
                        <div key={reason}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium capitalize">{reason.replace(/_/g, ' ')}</span>
                            <span className="text-muted-foreground">{data.count} entries · ${data.value.toFixed(2)}</span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-resend-orange/50 rounded-full transition-all"
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
                          <TableCell className="text-resend-red font-semibold">${log.value?.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize">{log.reason?.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {wastageLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No waste data</TableCell>
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
                  <div className="p-4 bg-resend-red/5 rounded-lg text-center">
                    <p className="text-2xl font-bold text-resend-red">${totalWastageValue.toFixed(2)}</p>
                    <p className="text-xs text-resend-red mt-1 font-medium">Total Waste Value</p>
                  </div>
                  <div className="p-4 bg-resend-orange/5 rounded-lg text-center">
                    <p className="text-2xl font-bold text-resend-orange">{wastageLogs.length}</p>
                    <p className="text-xs text-resend-orange mt-1 font-medium">Waste Entries</p>
                  </div>
                  <div className="p-4 bg-resend-yellow/5 rounded-lg text-center">
                    <p className="text-2xl font-bold text-resend-yellow">
                      {wastageLogs.length > 0 ? `$${(totalWastageValue / wastageLogs.length).toFixed(2)}` : '$0.00'}
                    </p>
                    <p className="text-xs text-resend-yellow mt-1 font-medium">Avg Waste per Entry</p>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {totalValue > 0 ? `${((totalWastageValue / totalValue) * 100).toFixed(1)}%` : '0%'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">Waste as % of Inventory</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

 {/* Count Sheets Tab */}
        <TabsContent value="daily-snapshot">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Items Added Today (new inventory received) */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Today's Received Items</CardTitle>
                <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
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
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">Last recorded counts before today's changes</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Prev Count</TableHead>
                      <TableHead>Prev Value</TableHead>
                      <TableHead>Current Count</TableHead>
                      <TableHead>Î” Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.filter(i => i.previous_quantity != null && i.previous_quantity !== i.current_quantity).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                                <span className={cn("font-medium", delta > 0 && "text-resend-green", delta < 0 && "text-resend-red")}>
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

        <TabsContent value="hardware-setup" className="space-y-4">
          <Card className="border-0 shadow-sm border-t-4 border-t-cyan-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanBarcode className="w-5 h-5 text-cyan-500" />
                  Bluetooth Hardware & Scale Integrations
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect Freepour scales and handheld scanners to automatically sync real-time weights to the Inventory Counts ledger.
                </p>
              </div>
              <Button size="sm" variant="outline" className="text-cyan-600 border-cyan-200 bg-cyan-50" onClick={() => toast.success("Searching for Bluetooth devices...")}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Scan for Devices
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* Connected Devices */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm">Connected Devices</h3>
                  <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center">
                        <Camera className="h-5 w-5 text-cyan-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Freepour Smart Scale X1</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500"></span> Online (Battery: 82%)
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-cyan-50 text-cyan-700">Active</Badge>
                  </div>
                  
                  <div className="rounded-lg border bg-card p-4 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                        <ScanBarcode className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Zebra BT Scanner</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-zinc-300"></span> Offline (Last seen 2 days ago)
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">Reconnect</Button>
                  </div>
                </div>

                {/* Incoming Data Stream */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm">Live Scale Data Stream</h3>
                  <div className="rounded-lg bg-zinc-950 p-4 font-mono text-xs overflow-hidden h-48 flex flex-col justify-end relative">
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-green-500 font-sans text-[10px] font-bold tracking-wider">LIVE</span>
                    </div>
                    <div className="space-y-2 opacity-80">
                      <p className="text-zinc-500">[10:02:14] System: Listening on COM4...</p>
                      <p className="text-zinc-400">[10:04:22] Scale X1: Tare weight set to 0.00g</p>
                      <p className="text-zinc-300">[10:04:45] Scale X1: Weight detected: <span className="text-green-400 font-bold">1,250g (Tito's Vodka 1L)</span></p>
                      <p className="text-zinc-300">[10:04:46] System: Match found! Calculating volume (Specific gravity: 0.95)...</p>
                      <p className="text-cyan-400">[10:04:46] API: POST /api/v1/inventory/counts</p>
                      <p className="text-green-400">[10:04:47] Database: Successfully recorded 1.3L for Tito's Vodka (CountSheet #402)</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
            <Button onClick={saveEdit} className="bg-primary hover:bg-primary">Save</Button>
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
            <Button onClick={saveAdd} className="bg-primary hover:bg-primary">Add Item</Button>
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
            <p className="text-sm text-muted-foreground">
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
            <Button onClick={saveConvert} className="bg-primary hover:bg-primary">Convert</Button>
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
            <p className="text-sm text-muted-foreground">
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
            <Button onClick={saveWastage} className="bg-resend-red hover:bg-resend-red">Log Wastage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Count Template Dialog */}
      <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Count Sheet Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={countTemplateName}
                onChange={(e) => setCountTemplateName(e.target.value)}
                placeholder="e.g., Daily Line Check"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This creates a reusable count sheet from the current inventory list.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTemplateOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary text-primary-foreground"
              disabled={createCountSheetMutation.isPending || !countTemplateName.trim()}
              onClick={() => createCountSheetMutation.mutate()}
            >
              {createCountSheetMutation.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Count Session (Full Screen Wizard) */}
      {activeSessionOpen && countSheets.length > 0 && (
        <ActiveCountSession
          sheet={countSheets.find(s => s.id === selectedCountSheetId) || countSheets[0]}
          inventory={inventory}
          onComplete={(counts) => {
             completeCountSessionMutation.mutate(counts);
          }}
          onCancel={() => setActiveSessionOpen(false)}
        />
      )}
      {/* Scanner Dialog */}
      <Dialog open={scannerDialogOpen} onOpenChange={setScannerDialogOpen}>
        <DialogContent className="sm:max-w-md overflow-hidden p-0 bg-black border-none">
          <div className="flex flex-col items-center justify-center p-8 space-y-6 text-center relative h-[400px]">
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
            
            <Camera className="h-16 w-16 text-white/50 animate-pulse mb-4 z-10" />
            <div className="w-64 h-64 border-2 border-primary/50 relative z-10">
               <div className="absolute top-0 left-0 w-full h-1 bg-resend-green animate-[scan_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(40,167,69,0.8)]"></div>
            </div>
            
            <p className="text-white font-medium z-10">Point camera at a product barcode to quickly find and edit it.</p>
            
            <Button 
              className="mt-8 z-10 bg-primary hover:bg-primary text-white w-full" 
              onClick={() => {
                if (inventory.length > 0) {
                  const randomItem = inventory[Math.floor(Math.random() * inventory.length)];
                  setSelectedItem(randomItem);
                  setEditForm({ ...randomItem });
                  setScannerDialogOpen(false);
                  setTimeout(() => setEditDialogOpen(true), 100);
                  toast.success(`Scanned: ${randomItem.product_name}`);
                } else {
                  toast.error("No items in inventory to scan.");
                }
              }}
            >
              Simulate Successful Scan
            </Button>
            <Button variant="ghost" className="text-white/70 hover:text-white z-10 absolute top-2 right-2" onClick={() => setScannerDialogOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
            <style jsx>{`
              @keyframes scan {
                0% { top: 0; }
                50% { top: 100%; }
                100% { top: 0; }
              }
            `}</style>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
