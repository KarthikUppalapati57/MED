import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Bell, BellOff, Download, Edit2, Eye, FileDown, Loader2, MapPin, Plus, Search, Upload, UtensilsCrossed } from 'lucide-react';
import Papa from 'papaparse';
import { api } from '@/lib/apiClient';
import { exportToCSV } from '@/lib/exportUtils';
import { useConfirmation } from '@/hooks/useConfirmation';
import { buildMenuItems, filterMenuItems, sortMenuItems } from '@/modules/recipes/lib/menuItemsDomain';
import { analyzeMenuItemImportRows } from '@/modules/recipes/lib/menuItemsImport';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const eventTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function describeAlertEventValue(event, side) {
  const value = side === 'previous' ? event.previous_value : event.current_value;
  if (!value) return '—';
  if ('cost' in value) return money.format(Number(value.cost || 0));
  if ('price' in value) return money.format(Number(value.price || 0));
  if ('target_percent' in value && 'plate_cost_percent' in value) return `${Number(value.plate_cost_percent || 0).toFixed(1)}% (target ${Number(value.target_percent || 0).toFixed(1)}%)`;
  if ('target_percent' in value) return `${Number(value.target_percent || 0).toFixed(1)}%`;
  if ('status' in value) return String(value.status).replaceAll('_', ' ');
  return '—';
}

const toggleValue = (values, value, checked) => checked ? [...new Set([...values, value])] : values.filter((entry) => entry !== value);

function SortableHead({ label, sortKey, sort, onSort, className = '' }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <TableHead className={className}><button type="button" className="inline-flex items-center gap-1 whitespace-nowrap font-medium hover:text-foreground" onClick={() => onSort(sortKey)}>{label}<Icon className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} /></button></TableHead>;
}

export default function MenuItemsOperations({ recipes, visibilityRows = [], visibilitySupported = false, locations = [], alertHistoryRows = [], alertHistorySupported = false, organizationId, brandId, locationId, onAdd, onEdit, onView }) {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmation();
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedAlertStatuses, setSelectedAlertStatuses] = useState([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [visibilityFilter, setVisibilityFilter] = useState('any');
  const [mappingFilter, setMappingFilter] = useState('any');
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState([]);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholdPercent, setThresholdPercent] = useState('30');
  const [viewingItem, setViewingItem] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [visibilityItem, setVisibilityItem] = useState(null);
  const [visibilityMode, setVisibilityMode] = useState('all');
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const importInputRef = useRef(null);

  const menuItems = useMemo(() => {
    const rowsByRecipe = visibilityRows.reduce((map, row) => {
      map.set(row.recipe_id, [...(map.get(row.recipe_id) || []), row]);
      return map;
    }, new Map());
    return buildMenuItems(recipes).map((item) => {
      const rows = rowsByRecipe.get(item.id) || [];
      const hidden = rows.some((row) => row.location_id === null && row.is_visible === false);
      const selectedIds = rows.filter((row) => row.location_id && row.is_visible).map((row) => row.location_id);
      return { ...item, visibilityMode: hidden ? 'hidden' : selectedIds.length ? 'selected' : 'all', visibleLocationIds: selectedIds };
    });
  }, [recipes, visibilityRows]);
  const supportsAlertLifecycle = useMemo(() => recipes.length > 0 && recipes.every((recipe) => Object.prototype.hasOwnProperty.call(recipe, 'margin_alert_status')), [recipes]);
  const categories = useMemo(() => [...new Set(menuItems.map((item) => item.category).filter(Boolean))].sort(), [menuItems]);
  const filteredItems = useMemo(() => sortMenuItems(filterMenuItems(menuItems, { search, categories: selectedCategories, alertStatuses: selectedAlertStatuses, visibility: visibilityFilter, activeOnly }).filter((item) => {
    if (mappingFilter === 'missing-price') return item.priceSource === 'missing';
    return true;
  }), sort.key, sort.direction), [menuItems, search, selectedCategories, selectedAlertStatuses, visibilityFilter, mappingFilter, activeOnly, sort]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredItems, currentPage, pageSize]);
  useEffect(() => setPage(1), [search, selectedCategories, selectedAlertStatuses, visibilityFilter, mappingFilter, activeOnly, sort, pageSize]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const selectedItems = useMemo(() => menuItems.filter((item) => selectedIds.includes(item.id)), [menuItems, selectedIds]);
  const averagePlateCost = useMemo(() => {
    const measurable = menuItems.filter((item) => item.plateCostPercent !== null);
    return measurable.length ? measurable.reduce((sum, item) => sum + item.plateCostPercent, 0) / measurable.length : 0;
  }, [menuItems]);

  const alertMutation = useMutation({
    mutationFn: async ({ ids, status }) => Promise.all(ids.map((id) => api.entities.Recipe.update(id, supportsAlertLifecycle ? {
      margin_alert_status: status,
      margin_alert_enabled: status === 'active',
    } : {
      margin_alert_enabled: status === 'active',
    }))),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-margin-alert-events'] });
      setSelectedIds([]);
      toast.success(variables.status === 'active' ? 'Cost alerts are active' : variables.status === 'paused' ? 'Cost alerts paused' : 'Cost alerts removed');
    },
    onError: (error) => toast.error(error?.message || 'Unable to update cost monitoring'),
  });

  const thresholdMutation = useMutation({
    mutationFn: async ({ ids, plateCostTarget }) => Promise.all(ids.map((id) => api.entities.Recipe.update(id, {
      target_margin_percent: 100 - plateCostTarget,
    }))),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-margin-alert-events'] });
      setSelectedIds([]);
      setThresholdOpen(false);
      toast.success(`Plate-cost target set to ${variables.plateCostTarget}%`);
    },
    onError: (error) => toast.error(error?.message || 'Unable to update plate-cost target'),
  });

  const visibilityMutation = useMutation({
    mutationFn: async ({ recipeId, mode, locationIds }) => {
      await api.entities.RecipeLocationVisibility.deleteMany(visibilityRows.filter((row) => row.recipe_id === recipeId).map((row) => row.id));
      if (mode === 'hidden') await api.entities.RecipeLocationVisibility.create({ organization_id: organizationId, recipe_id: recipeId, location_id: null, is_visible: false });
      if (mode === 'selected') await api.entities.RecipeLocationVisibility.createMany(locationIds.map((id) => ({ organization_id: organizationId, recipe_id: recipeId, location_id: id, is_visible: true })));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recipe-location-visibility'] }); setVisibilityItem(null); toast.success('Menu-item visibility updated'); },
    onError: (error) => toast.error(error?.message || 'Unable to update visibility'),
  });

  const openVisibility = (item) => {
    if (!visibilitySupported) { toast.info('Location visibility requires the recipe_location_visibility database migration.'); return; }
    setVisibilityItem(item); setVisibilityMode(item.visibilityMode); setSelectedLocationIds(item.visibleLocationIds || []);
  };

  const saveVisibility = async () => {
    if (visibilityMode === 'selected' && !selectedLocationIds.length) { toast.error('Select at least one location.'); return; }
    if (visibilityMode === 'hidden') {
      const confirmed = await confirm({ title: 'Hide this menu item?', description: `${visibilityItem.name} will not be visible at any location.`, confirmText: 'Hide item', variant: 'destructive', severity: 'high' });
      if (!confirmed) return;
    }
    visibilityMutation.mutate({ recipeId: visibilityItem.id, mode: visibilityMode, locationIds: selectedLocationIds });
  };

  const updateAlerts = async (status) => {
    if (!selectedIds.length) return;
    if (status === 'paused' && !supportsAlertLifecycle) {
      toast.info('Paused alerts require the margin_alert_status database migration. Active and No Alerts remain available.');
      return;
    }
    const action = status === 'active' ? 'Activate' : status === 'paused' ? 'Pause' : 'Remove';
    const confirmed = await confirm({
      title: `${action} cost alerts?`,
      description: `${selectedIds.length} menu item${selectedIds.length === 1 ? '' : 's'} will be updated.`,
      confirmText: `${action} alerts`,
      variant: status === 'none' ? 'destructive' : 'default',
      severity: status === 'none' ? 'high' : 'medium',
    });
    if (confirmed) alertMutation.mutate({ ids: selectedIds, status });
  };

  const updateThreshold = async () => {
    const plateCostTarget = Number(thresholdPercent);
    if (!Number.isFinite(plateCostTarget) || plateCostTarget <= 0 || plateCostTarget >= 100) {
      toast.error('Enter a target greater than 0% and less than 100%.');
      return;
    }
    const confirmed = await confirm({
      title: 'Update plate-cost target?',
      description: `${selectedIds.length} menu item${selectedIds.length === 1 ? '' : 's'} will use ${plateCostTarget}% as the alert threshold.`,
      confirmText: 'Update target',
      severity: 'medium',
    });
    if (confirmed) thresholdMutation.mutate({ ids: selectedIds, plateCostTarget });
  };

  const exportRows = () => {
    const rows = selectedItems.length ? selectedItems : filteredItems;
    exportToCSV(rows.map((item) => ({
      Name: item.name,
      Classification: item.category || 'Unclassified',
      Status: item.status || 'active',
      Cost: item.cost.toFixed(2),
      'Menu Price': item.menuPrice.toFixed(2),
      'Unit Profit': item.netProfit.toFixed(2),
      'Plate Cost %': item.plateCostPercent === null ? '' : item.plateCostPercent.toFixed(1),
      'Plate Cost Target %': item.targetPlateCostPercent.toFixed(1),
      'Ingredient Source': item.inventoryTracking ? 'Products linked' : 'No ingredients',
      Visibility: item.visibilityMode === 'all' ? 'All Locations' : item.visibilityMode === 'hidden' ? 'Hidden' : `Selected: ${item.visibleLocationIds.map((id) => locations.find((entry) => entry.id === id)?.name).filter(Boolean).join('; ')}`,
      'Price Source': item.priceSource,
      'Cost Monitoring': item.alertStatus === 'active' ? 'Active' : item.alertStatus === 'paused' ? 'Paused' : 'No Alerts',
    })), `menu-items-${new Date().toISOString().slice(0, 10)}`);
  };

  const downloadImportTemplate = () => exportToCSV([{
    Name: 'Example Menu Item',
    Classification: 'main_course',
    Status: 'active',
    'Menu Price': '12.00',
    'Cost Monitoring': supportsAlertLifecycle ? 'Paused' : 'Active',
    Visibility: 'All Locations',
  }], 'menu-items-import-template');

  const importRows = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = await new Promise((resolve, reject) => Papa.parse(file, { header: true, skipEmptyLines: true, complete: resolve, error: reject }));
      if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
      if (!parsed.data.length) throw new Error('The CSV file is empty.');
      setImportPreview({ fileName: file.name, rows: analyzeMenuItemImportRows(parsed.data, menuItems, supportsAlertLifecycle, locations, visibilitySupported) });
    } catch (error) {
      toast.error(error?.message || 'Unable to read menu items');
    }
  };

  const executeImport = async () => {
    const validRows = importPreview?.rows.filter((row) => row.action !== 'invalid') || [];
    if (!validRows.length) return;
    const createCount = validRows.filter((row) => row.action === 'create').length;
    const updateCount = validRows.length - createCount;
    const confirmed = await confirm({ title: 'Import valid menu items?', description: `${createCount} will be created, ${updateCount} will be updated, and ${(importPreview?.rows.length || 0) - validRows.length} invalid rows will be skipped.`, confirmText: 'Import valid rows', severity: 'medium' });
    if (!confirmed) return;
    setIsImporting(true);
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const previewRow of validRows) {
      const { rowNumber: _rowNumber, existingId, action: _action, errors: _errors, visibility_mode: importedVisibilityMode, visible_location_ids: importedLocationIds, ...row } = previewRow;
      const compatibleRow = supportsAlertLifecycle ? row : Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'margin_alert_status'));
      try {
        let savedRecipe;
        if (existingId) {
          savedRecipe = await api.entities.Recipe.update(existingId, compatibleRow);
          updated += 1;
        } else {
          savedRecipe = await api.entities.Recipe.create({
            ...compatibleRow,
            organization_id: organizationId,
            brand_id: brandId,
            location_id: locationId,
            is_batch: false,
            yield_quantity: 1,
            yield_unit: 'serving',
            yield_percentage: 100,
            ingredients: [],
            packaging_items: [],
            cost_per_serving: 0,
          });
          created += 1;
        }
        if (visibilitySupported && savedRecipe?.id) {
          await api.entities.RecipeLocationVisibility.deleteMany(visibilityRows.filter((entry) => entry.recipe_id === savedRecipe.id).map((entry) => entry.id));
          if (importedVisibilityMode === 'hidden') await api.entities.RecipeLocationVisibility.create({ organization_id: organizationId, recipe_id: savedRecipe.id, location_id: null, is_visible: false });
          if (importedVisibilityMode === 'selected') await api.entities.RecipeLocationVisibility.createMany(importedLocationIds.map((id) => ({ organization_id: organizationId, recipe_id: savedRecipe.id, location_id: id, is_visible: true })));
        }
      } catch {
        failed += 1;
      }
    }
    try {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-location-visibility'] });
      setImportPreview(null);
      const skipped = (importPreview?.rows.length || 0) - validRows.length;
      toast.success(`Import complete: ${created} created, ${updated} updated, ${skipped} skipped${failed ? `, ${failed} failed` : ''}`);
    } finally {
      setIsImporting(false);
    }
  };

  const allVisibleSelected = paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.includes(item.id));
  const toggleAll = (checked) => setSelectedIds(checked ? [...new Set([...selectedIds, ...paginatedItems.map((item) => item.id)])] : selectedIds.filter((id) => !paginatedItems.some((item) => item.id === id)));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sellable Menu Items</h2>
          <p className="text-sm text-muted-foreground">Finished dishes with price, profit, and plate-cost tracking.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importRows} />
          <Button variant="ghost" onClick={downloadImportTemplate}><FileDown className="mr-2 h-4 w-4" /> CSV template</Button>
          <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={isImporting}><Upload className="mr-2 h-4 w-4" /> {isImporting ? 'Importing...' : 'Import CSV'}</Button>
          <Button variant="outline" onClick={exportRows} disabled={!filteredItems.length}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
          <Button onClick={onAdd}><Plus className="mr-2 h-4 w-4" /> Add sellable item</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sellable items</p><p className="mt-1 text-2xl font-semibold">{menuItems.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Average plate cost</p><p className="mt-1 text-2xl font-semibold">{averagePlateCost.toFixed(1)}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Above configured target</p><p className="mt-1 text-2xl font-semibold">{menuItems.filter((item) => item.isAboveTarget).length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_150px_150px_150px_auto]">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Find a menu item" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="justify-between font-normal">Type <span className="font-semibold">{selectedCategories.length ? `${selectedCategories.length} selected` : 'All'}</span></Button></DropdownMenuTrigger><DropdownMenuContent className="w-64" align="start"><DropdownMenuCheckboxItem checked={!selectedCategories.length} onCheckedChange={() => setSelectedCategories([])}>All types</DropdownMenuCheckboxItem><DropdownMenuSeparator />{categories.map((value) => <DropdownMenuCheckboxItem key={value} checked={selectedCategories.includes(value)} onCheckedChange={(checked) => setSelectedCategories((current) => toggleValue(current, value, checked))} className="capitalize">{value.replaceAll('_', ' ')}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="justify-between font-normal">Alerts <span className="font-semibold">{selectedAlertStatuses.length ? `${selectedAlertStatuses.length} selected` : 'All'}</span></Button></DropdownMenuTrigger><DropdownMenuContent className="w-56" align="start"><DropdownMenuCheckboxItem checked={!selectedAlertStatuses.length} onCheckedChange={() => setSelectedAlertStatuses([])}>All</DropdownMenuCheckboxItem><DropdownMenuSeparator /><DropdownMenuLabel>Alert types</DropdownMenuLabel><DropdownMenuCheckboxItem checked={selectedAlertStatuses.includes('active')} onCheckedChange={(checked) => setSelectedAlertStatuses((current) => toggleValue(current, 'active', checked))}>Active</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={selectedAlertStatuses.includes('paused')} onCheckedChange={(checked) => setSelectedAlertStatuses((current) => toggleValue(current, 'paused', checked))}>Paused</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={selectedAlertStatuses.includes('none')} onCheckedChange={(checked) => setSelectedAlertStatuses((current) => toggleValue(current, 'none', checked))}>No Alerts</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu>
            <Select value={visibilityFilter} onValueChange={setVisibilityFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">All visibility</SelectItem><SelectItem value="all">All locations</SelectItem><SelectItem value="selected">Selected locations</SelectItem><SelectItem value="hidden">Hidden</SelectItem></SelectContent></Select>
            <Select value={mappingFilter === 'missing-price' ? 'missing-price' : 'any'} onValueChange={setMappingFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">All prices</SelectItem><SelectItem value="missing-price">Missing price</SelectItem></SelectContent></Select>
            <label className="flex items-center gap-2 rounded-md border px-3 text-sm"><Checkbox checked={activeOnly} onCheckedChange={(checked) => setActiveOnly(Boolean(checked))} /> Active only</label>
          </div>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="border-primary/30 bg-primary/5"><CardContent className="flex flex-wrap items-center gap-2 p-3"><span className="mr-auto text-sm font-medium">{selectedIds.length} selected</span><Button size="sm" variant="outline" onClick={() => { const first = selectedItems[0]; setThresholdPercent(String(first?.targetPlateCostPercent ?? 30)); setThresholdOpen(true); }}>Set target</Button><Button size="sm" variant="outline" onClick={() => updateAlerts('active')} disabled={alertMutation.isPending}><Bell className="mr-2 h-4 w-4" /> Enable / Resume</Button><Button size="sm" variant="outline" onClick={() => updateAlerts('paused')} disabled={alertMutation.isPending || !supportsAlertLifecycle} title={!supportsAlertLifecycle ? 'Apply the alert lifecycle database migration to enable Pause' : undefined}><BellOff className="mr-2 h-4 w-4" /> Pause</Button><Button size="sm" variant="outline" onClick={() => updateAlerts('none')} disabled={alertMutation.isPending}><BellOff className="mr-2 h-4 w-4" /> Remove alerts</Button><Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button></CardContent></Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Selling economics</span><span className="text-sm font-normal text-muted-foreground">{filteredItems.length} items</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select visible menu items" /></TableHead><SortableHead label="Name" sortKey="name" sort={sort} onSort={changeSort} /><SortableHead label="Classification" sortKey="category" sort={sort} onSort={changeSort} /><SortableHead label="Ingredient source" sortKey="inventoryTracking" sort={sort} onSort={changeSort} /><SortableHead label="Visibility" sortKey="visibilityMode" sort={sort} onSort={changeSort} /><SortableHead label="Unit cost" sortKey="cost" sort={sort} onSort={changeSort} className="text-right" /><SortableHead label="Menu price" sortKey="menuPrice" sort={sort} onSort={changeSort} className="text-right" /><SortableHead label="Unit profit" sortKey="netProfit" sort={sort} onSort={changeSort} className="text-right" /><SortableHead label="Plate cost" sortKey="plateCostPercent" sort={sort} onSort={changeSort} className="text-right" /><SortableHead label="Monitoring" sortKey="monitoring" sort={sort} onSort={changeSort} /><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {!filteredItems.length ? <TableRow><TableCell colSpan={11} className="h-32 text-center"><div className="flex flex-col items-center gap-2 text-muted-foreground"><p>No menu items match these controls.</p><Button type="button" size="sm" onClick={onAdd}><Plus className="mr-2 h-4 w-4" /> Add sellable item</Button></div></TableCell></TableRow> : paginatedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(checked) => setSelectedIds(checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} aria-label={`Select ${item.name}`} /></TableCell>
                    <TableCell><button type="button" className="font-medium hover:text-primary hover:underline" onClick={() => onView ? onView(item) : setViewingItem(item)}>{item.name}</button><p className="text-xs text-muted-foreground">{item.status || 'active'}</p></TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{(item.category || 'unclassified').replaceAll('_', ' ')}</Badge></TableCell>
                    <TableCell>{item.inventoryTracking ? <Badge variant="outline">Products linked · {item.mappedIngredientCount}</Badge> : <span className="text-sm text-muted-foreground">No ingredients</span>}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openVisibility(item)}><MapPin className="mr-1 h-3.5 w-3.5" />{item.visibilityMode === 'all' ? 'All Locations' : item.visibilityMode === 'hidden' ? 'Hidden' : `${item.visibleLocationIds.length} Locations`}</Button></TableCell>
                    <TableCell className="text-right tabular-nums">{money.format(item.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money.format(item.menuPrice)}<p className="text-xs capitalize text-muted-foreground">{item.priceSource}</p></TableCell>
                    <TableCell className={`text-right tabular-nums ${item.netProfit < 0 ? 'text-destructive' : ''}`}>{money.format(item.netProfit)}</TableCell>
                    <TableCell className="text-right"><Badge variant={item.isAboveTarget ? 'destructive' : 'outline'}>{item.plateCostPercent === null ? 'Set price' : `${item.plateCostPercent.toFixed(1)}% / ${item.targetPlateCostPercent.toFixed(1)}%`}</Badge></TableCell>
                    <TableCell>{item.alertSeverity === 'attention' ? <span className="flex items-center gap-1 text-sm text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Needs attention</span> : item.alertStatus === 'active' ? <span className="flex items-center gap-1 text-sm"><Bell className="h-3.5 w-3.5 text-primary" /> Active</span> : item.alertStatus === 'paused' ? <span className="flex items-center gap-1 text-sm text-amber-600"><BellOff className="h-3.5 w-3.5" /> Paused</span> : <span className="text-sm text-muted-foreground">No Alerts</span>}</TableCell>
                    <TableCell className="text-right"><Button size="icon" variant="ghost" aria-label={`View ${item.name}`} onClick={() => onView ? onView(item) : setViewingItem(item)}><Eye className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Edit2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredItems.length ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredItems.length)} of ${filteredItems.length}` : '0 items'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
              </Select>
              <span className="min-w-24 text-center text-sm">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</Button>
              <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(viewingItem)} onOpenChange={(open) => !open && setViewingItem(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {viewingItem && <><SheetHeader><SheetTitle>{viewingItem.name}</SheetTitle></SheetHeader><div className="mt-6 space-y-5"><div className="grid grid-cols-2 gap-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unit cost</p><p className="text-xl font-semibold">{money.format(viewingItem.cost)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Menu price</p><p className="text-xl font-semibold">{money.format(viewingItem.menuPrice)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unit profit</p><p className="text-xl font-semibold">{money.format(viewingItem.netProfit)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Plate cost / target</p><p className="text-xl font-semibold">{viewingItem.plateCostPercent === null ? 'Price required' : `${viewingItem.plateCostPercent.toFixed(1)}% / ${viewingItem.targetPlateCostPercent.toFixed(1)}%`}</p></CardContent></Card></div>{viewingItem.isAboveTarget && <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> Plate cost is above this item’s {viewingItem.targetPlateCostPercent.toFixed(1)}% target.</div>}<div><h3 className="mb-2 font-medium">Ingredients</h3><div className="space-y-2">{(viewingItem.ingredients || []).length ? viewingItem.ingredients.map((ingredient, index) => <div key={`${ingredient.product_id || ingredient.sub_recipe_id || index}`} className="flex justify-between rounded-md border p-3 text-sm"><span>{ingredient.product_name || 'Ingredient'}</span><span>{ingredient.quantity || 0} {ingredient.unit || ''} · {money.format(Number(ingredient.total_cost || 0))}</span></div>) : <p className="text-sm text-muted-foreground">No ingredients have been added.</p>}</div></div><div><h3 className="mb-2 font-medium">Alert history</h3>{!alertHistorySupported ? <p className="rounded-md border p-3 text-sm text-muted-foreground">Alert history becomes available after the Recipe alert-events migration is applied.</p> : !alertHistoryRows.some((event) => event.recipe_id === viewingItem.id) ? <p className="rounded-md border p-3 text-sm text-muted-foreground">No alert events recorded yet.</p> : <div className="max-h-72 space-y-2 overflow-y-auto">{alertHistoryRows.filter((event) => event.recipe_id === viewingItem.id).map((event) => <div key={event.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{event.message}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{event.event_type.replaceAll('_', ' ')} · {event.actor_user_id ? 'User change' : 'Automated change'}</p></div><time className="shrink-0 text-xs text-muted-foreground">{eventTime.format(new Date(event.created_at))}</time></div><p className="mt-2 text-xs text-muted-foreground">{describeAlertEventValue(event, 'previous')} → {describeAlertEventValue(event, 'current')}</p></div>)}</div>}</div><Button className="w-full" onClick={() => { setViewingItem(null); onEdit(viewingItem); }}><Edit2 className="mr-2 h-4 w-4" /> Edit recipe</Button></div></>}
        </SheetContent>
      </Sheet>

      <Dialog open={thresholdOpen} onOpenChange={(open) => !thresholdMutation.isPending && setThresholdOpen(open)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Plate-cost alert target</DialogTitle><DialogDescription>Set the maximum acceptable plate-cost percentage for {selectedIds.length} selected menu item{selectedIds.length === 1 ? '' : 's'}.</DialogDescription></DialogHeader>
          <div className="space-y-2"><label htmlFor="plate-cost-target" className="text-sm font-medium">Target percentage</label><div className="relative"><Input id="plate-cost-target" type="number" min="0.1" max="99.9" step="0.1" value={thresholdPercent} onChange={(event) => setThresholdPercent(event.target.value)} className="pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div><p className="text-xs text-muted-foreground">Items with active monitoring show “Needs attention” when plate cost exceeds this value.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setThresholdOpen(false)} disabled={thresholdMutation.isPending}>Cancel</Button><Button onClick={updateThreshold} disabled={thresholdMutation.isPending}>{thresholdMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save target'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(importPreview)} onOpenChange={(open) => !open && !isImporting && setImportPreview(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Review menu-item import</DialogTitle><DialogDescription>{importPreview?.fileName} · Valid rows will be imported; invalid rows will be skipped.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Name</TableHead><TableHead>Classification</TableHead><TableHead>Menu price</TableHead><TableHead>Monitoring</TableHead><TableHead>Visibility</TableHead><TableHead>Outcome</TableHead></TableRow></TableHeader><TableBody>{importPreview?.rows.map((row) => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell>{row.name || <span className="text-destructive">Missing</span>}</TableCell><TableCell className="capitalize">{row.category.replaceAll('_', ' ')}</TableCell><TableCell>{Number.isFinite(row.selling_price) ? money.format(row.selling_price) : 'Invalid'}</TableCell><TableCell className="capitalize">{row.margin_alert_status}</TableCell><TableCell className="capitalize">{row.visibility_mode.replaceAll('_', ' ')}</TableCell><TableCell>{row.action === 'invalid' ? <div><Badge variant="destructive">Invalid</Badge><p className="mt-1 max-w-xs text-xs text-destructive">{row.errors.join(' · ')}</p></div> : <Badge variant={row.action === 'create' ? 'default' : 'secondary'}>{row.action === 'create' ? 'New item' : 'Will update'}</Badge>}</TableCell></TableRow>)}</TableBody></Table></div>
          <DialogFooter><Button variant="outline" onClick={() => setImportPreview(null)} disabled={isImporting}>Cancel</Button><Button onClick={executeImport} disabled={isImporting || !importPreview?.rows.some((row) => row.action !== 'invalid')}>{isImporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : 'Import valid rows'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(visibilityItem)} onOpenChange={(open) => !open && !visibilityMutation.isPending && setVisibilityItem(null)}><DialogContent><DialogHeader><DialogTitle>Location visibility</DialogTitle><DialogDescription>Choose where {visibilityItem?.name} is available.</DialogDescription></DialogHeader><div className="space-y-3"><Select value={visibilityMode} onValueChange={setVisibilityMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All locations</SelectItem><SelectItem value="selected">Selected locations</SelectItem><SelectItem value="hidden">Hidden everywhere</SelectItem></SelectContent></Select>{visibilityMode === 'selected' && <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-3">{locations.map((entry) => <label key={entry.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedLocationIds.includes(entry.id)} onCheckedChange={(checked) => setSelectedLocationIds((current) => checked ? [...new Set([...current, entry.id])] : current.filter((id) => id !== entry.id))} />{entry.name}</label>)}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setVisibilityItem(null)} disabled={visibilityMutation.isPending}>Cancel</Button><Button onClick={saveVisibility} disabled={visibilityMutation.isPending}>{visibilityMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save visibility'}</Button></DialogFooter></DialogContent></Dialog>

    </div>
  );
}
