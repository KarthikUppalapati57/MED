import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Plus,
  Save,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { getFlattenedCOA } from '@/lib/accountingConfig';
import {
  PRODUCT_UNIT_OPTIONS,
  calculateConvertedInventoryUnit,
  parsePackageContents,
} from '@/modules/products/utils/productUnits';
import UnitConversionsManager from '@/modules/recipes/components/UnitConversionsManager';

const DEFAULT_CATEGORIES = [
  'Bakery',
  'Beer',
  'Cleaning Supplies',
  'Dairy',
  'Frozen',
  'Grocery and Dry Goods',
  'Liquor',
  'Meat',
  'N/A Bev',
  'Paper and Packaging',
  'Poultry',
  'Produce',
  'Restaurant Supplies',
  'Retail',
  'Seafood',
];

const CATEGORY_ACCOUNTING_CODES = {
  'Paper and Packaging': '5110',
  'Cleaning Supplies': '5110',
  'Restaurant Supplies': '5110',
  Bakery: '5110',
  Meat: '5110',
  Poultry: '5120',
  Seafood: '5130',
  Dairy: '5140',
  Produce: '5150',
  Frozen: '5160',
  'Grocery and Dry Goods': '5170',
  Beer: '5230',
  Wine: '5240',
  Liquor: '5220',
  'N/A Bev': '5210',
  Retail: '5300',
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatQuantity(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function buildReportUnitLabel(quantity, unit, nickname = '') {
  const trimmedNickname = nickname.trim();
  const trimmedUnit = String(unit || '').trim() || 'Each';
  const unitLabel = `${formatQuantity(quantity || 1)} ${trimmedUnit}`;
  if (trimmedNickname) return `${trimmedNickname} (${unitLabel})`;
  return `${formatQuantity(quantity || 1)} ${trimmedUnit}`;
}

function countSheetItemKey(item = {}) {
  const safeItem = item || {};
  return String(safeItem.inventory_id || safeItem.product_id || safeItem.product_name || '').trim().toLowerCase();
}

function productInventoryKey(product = {}, inventoryItem = {}) {
  const safeProduct = product || {};
  const safeInventoryItem = inventoryItem || {};
  return String(
    safeInventoryItem.id ||
    safeProduct.id ||
    safeProduct.product_id ||
    safeProduct.name ||
    ''
  ).trim().toLowerCase();
}

function getAccountingForCategory(category, fallback = '5110') {
  const normalized = String(category || '').trim().toLowerCase();
  const match = Object.entries(CATEGORY_ACCOUNTING_CODES)
    .find(([label]) => label.toLowerCase() === normalized);
  return match?.[1] || fallback;
}

function buildForm(product) {
  return {
    name: product?.name || '',
    product_id: product?.product_id || '',
    description: product?.description || '',
    category: product?.category || 'Uncategorized',
    category_percent: 100,
    accounting_category: product?.accounting_category || '5110',
    is_tax_exempt: product?.is_tax_exempt ?? false,
    is_inventoried: product?.is_inventoried ?? false,
    report_by_unit: product?.report_by_unit || 'Each',
    base_unit: product?.base_unit || product?.report_by_unit || 'Each',
    latest_price: Number(product?.latest_price || 0),
    report_unit_quantity: Number(product?.report_unit_quantity || 1),
    report_unit_source_price: Number(product?.report_unit_source_price ?? product?.latest_price ?? 0),
    location_specific: product?.location_specific ?? false,
  };
}

function Section({ title, children, action }) {
  return (
    <section className="border-b border-border px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ProductDetail({ initialProduct = null, categoryOptions = [], productId: suppliedProductId = null }) {
  const navigate = useNavigate();
  const { '*': splat } = useParams();
  const productId = suppliedProductId || splat?.split('/')[1] || initialProduct?.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => buildForm(initialProduct));
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDraft, setUnitDraft] = useState({
    nickname: 'Case',
    sourceQuantity: 1,
    sourceUnit: initialProduct?.base_unit || initialProduct?.report_by_unit || 'Each',
    targetQuantity: 1,
    targetUnit: initialProduct?.base_unit || initialProduct?.report_by_unit || 'Each',
    sourcePrice: Number(initialProduct?.report_unit_source_price ?? initialProduct?.latest_price ?? 0),
    makePrimary: false,
  });
  const [countUnitRows, setCountUnitRows] = useState([]);
  const [selectedCountSheetId, setSelectedCountSheetId] = useState('');

  const { data: fetchedProduct, isLoading } = useAuthQuery({
    queryKey: ['product-detail', productId],
    queryFn: () => api.entities.Product.get(productId),
    enabled: !!productId,
  });

  const product = fetchedProduct || initialProduct;

  const { data: productInventoryItems = [] } = useAuthQuery({
    queryKey: ['product-detail-inventory', product?.id, product?.product_id],
    queryFn: async () => {
      if (!product?.organization_id) return [];
      const queries = [];

      if (product.id) {
        queries.push(
          api.client
            .from('inventory')
            .select('*')
            .eq('organization_id', product.organization_id)
            .eq('internal_product_id', product.id)
            .is('deleted_at', null)
            .limit(10)
        );
      }

      if (product.product_id) {
        queries.push(
          api.client
            .from('inventory')
            .select('*')
            .eq('organization_id', product.organization_id)
            .eq('product_id', product.product_id)
            .is('deleted_at', null)
            .limit(10)
        );
      }

      if (queries.length === 0) return [];

      const results = await Promise.all(queries);
      const rows = results.flatMap(({ data, error }) => {
        if (error) throw error;
        return data || [];
      });
      return [...new Map(rows.map(row => [row.id, row])).values()];
    },
    enabled: !!product?.organization_id && !!product?.id,
  });

  const primaryInventoryItem = productInventoryItems[0] || null;

  const { data: countSheets = [] } = useAuthQuery({
    queryKey: ['product-detail-count-sheets', product?.organization_id, product?.location_id],
    queryFn: async () => {
      if (!product?.organization_id) return [];
      const { data, error } = await api.client
        .from('count_sheets')
        .select('*')
        .eq('organization_id', product.organization_id)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []).filter(sheet => {
        if (sheet.status && !['active', 'draft'].includes(sheet.status)) return false;
        if (product.location_id && sheet.location_id && sheet.location_id !== product.location_id) return false;
        return true;
      });
    },
    enabled: !!product?.organization_id,
  });

  const productCountSheetKey = productInventoryKey(product, primaryInventoryItem);
  const countSheetRows = useMemo(() => {
    return countSheets.map(sheet => {
      const items = Array.isArray(sheet.items) ? sheet.items : [];
      const assigned = items.some(item => countSheetItemKey(item) === productCountSheetKey);
      return { ...sheet, assigned };
    });
  }, [countSheets, productCountSheetKey]);

  const countSheetMutation = useMutation({
    mutationFn: async ({ sheet, action }) => {
      if (!sheet?.id) throw new Error('Count sheet not found');
      const items = Array.isArray(sheet.items) ? sheet.items : [];
      const inventoryItem = primaryInventoryItem;
      const nextItems = action === 'remove'
        ? items.filter(item => countSheetItemKey(item) !== productCountSheetKey)
        : [
            ...items.filter(item => countSheetItemKey(item) !== productCountSheetKey),
            {
              inventory_id: inventoryItem?.id || product.id,
              product_id: inventoryItem?.product_id || product.product_id || product.id,
              product_name: inventoryItem?.product_name || product.name,
              expected_quantity: inventoryItem?.current_quantity || 0,
              unit: inventoryItem?.current_unit || form.base_unit || form.report_by_unit || 'Each',
              sort_order: items.length + 1,
            },
          ];

      const { data, error } = await api.client
        .from('count_sheets')
        .update({ items: nextItems, updated_at: new Date().toISOString() })
        .eq('id', sheet.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-detail-count-sheets'] });
      toast.success('Count sheet updated');
      setSelectedCountSheetId('');
    },
    onError: (error) => toast.error(error?.message || 'Unable to update count sheet'),
  });

  useEffect(() => {
    if (!product) return;
    const nextForm = buildForm(product);
    const parsedPackage = parsePackageContents(nextForm.report_by_unit) || parsePackageContents(nextForm.base_unit);
    setForm(nextForm);
    setUnitDraft({
      nickname: nextForm.report_by_unit,
      sourceQuantity: parsedPackage?.quantity || nextForm.report_unit_quantity || 1,
      sourceUnit: parsedPackage?.unit || nextForm.base_unit || nextForm.report_by_unit || 'Each',
      targetQuantity: 1,
      targetUnit: parsedPackage?.unit || nextForm.base_unit || nextForm.report_by_unit || 'Each',
      sourcePrice: nextForm.report_unit_source_price || nextForm.latest_price || 0,
      makePrimary: false,
    });
    setCountUnitRows([]);
  }, [product]);

  const allCategoryOptions = useMemo(() => {
    const categories = new Set([
      ...DEFAULT_CATEGORIES,
      ...categoryOptions.filter(Boolean),
      form.category,
    ]);
    return [...categories].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [categoryOptions, form.category]);

  const reportUnitOptions = useMemo(() => {
    const units = new Set([form.report_by_unit, form.base_unit, ...PRODUCT_UNIT_OPTIONS].filter(Boolean));
    return [...units];
  }, [form.report_by_unit, form.base_unit]);

  const convertedUnit = useMemo(() => calculateConvertedInventoryUnit({
    sourcePrice: unitDraft.sourcePrice,
    sourceQuantity: unitDraft.sourceQuantity,
    sourceUnit: unitDraft.sourceUnit,
    targetQuantity: unitDraft.targetQuantity,
    targetUnit: unitDraft.targetUnit,
  }), [unitDraft.sourcePrice, unitDraft.sourceQuantity, unitDraft.sourceUnit, unitDraft.targetQuantity, unitDraft.targetUnit]);
  const convertedPrice = convertedUnit.price;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const savedProduct = await api.products.updateProductDetails(productId, form);

      if (form.is_inventoried) {
        const trackingResult = await api.products.setInventoryTracking(productId, true);
        const inventoryItemId = primaryInventoryItem?.id || trackingResult?.inventory_item_id;

        if (inventoryItemId) {
          const quantity = Number(primaryInventoryItem?.current_quantity || 0);
          await api.entities.Inventory.update(inventoryItemId, {
            product_name: form.name,
            product_id: form.product_id,
            internal_product_id: productId,
            category: form.category,
            accounting_category: form.accounting_category,
            current_unit: form.base_unit || form.report_by_unit || 'Each',
            report_by: form.report_by_unit || form.base_unit || 'Each',
            unit_cost: form.latest_price,
            current_value: quantity * Number(form.latest_price || 0),
          });
        }
      } else if (product?.is_inventoried) {
        await api.products.setInventoryTracking(productId, false);
      }

      return savedProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['conversion-catalog-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-detail', productId] });
      queryClient.invalidateQueries({ queryKey: ['product-detail-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Product saved');
    },
    onError: (error) => toast.error(error?.message || 'Failed to save product'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.products.deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted');
      navigate(`/Products/all-products${window.location.search}`);
    },
    onError: (error) => toast.error(error?.message || 'Failed to delete product'),
  });

  const updateCategory = (category) => {
    setForm(current => ({
      ...current,
      category,
      accounting_category: getAccountingForCategory(category, current.accounting_category),
    }));
  };

  const applyUnitDraft = () => {
    if (!convertedUnit.canConvert) {
      toast.error(convertedUnit.reason || 'Unable to calculate this unit conversion');
      return;
    }
    const label = buildReportUnitLabel(unitDraft.targetQuantity, unitDraft.targetUnit, unitDraft.nickname);
    const nextRow = {
      id: `draft-unit:${Date.now()}`,
      name: label,
      quantity: Number(unitDraft.targetQuantity || 1),
      unit: unitDraft.targetUnit,
      price: convertedPrice,
      sourceLabel: `${formatQuantity(unitDraft.sourceQuantity)} ${unitDraft.sourceUnit}`,
      sourcePrice: Number(unitDraft.sourcePrice || 0),
    };
    setCountUnitRows(current => [
      ...current.filter(row => String(row.name).toLowerCase() !== String(label).toLowerCase()),
      nextRow,
    ]);
    if (unitDraft.makePrimary) {
      setForm(current => ({
        ...current,
        report_by_unit: label,
        base_unit: unitDraft.targetUnit,
        report_unit_quantity: Number(unitDraft.targetQuantity || 1),
        report_unit_source_price: Number(unitDraft.sourcePrice || 0),
        latest_price: convertedPrice || current.latest_price,
      }));
    }
    setUnitDialogOpen(false);
  };

  if (isLoading && !product) {
    return <div className="p-8 text-muted-foreground">Loading product...</div>;
  }

  if (!product) {
    return (
      <div className="space-y-4 p-8">
        <Button variant="ghost" onClick={() => navigate(`/Products/all-products${window.location.search}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Product not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background pb-4">
        <div className="min-w-0">
          <Button variant="ghost" className="mb-2 px-0" onClick={() => navigate(`/Products/all-products${window.location.search}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="truncate text-3xl font-bold tracking-normal text-foreground">{form.name || 'Edit Product'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{form.product_id || 'No Product ID'} · Master product management</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(`/Products/all-products${window.location.search}`)}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
          <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="overflow-hidden border border-border bg-background shadow-sm">
        <Section title="Product Details">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-2">
              <Label>Product ID</Label>
              <Input value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} />
            </div>
          </div>
        </Section>

        <Section
          title="Category Assignments"
          action={(
            <Button variant="ghost" className="text-primary">
              <Plus className="mr-2 h-4 w-4" /> Add a category
            </Button>
          )}
        >
          <p className="mb-4 text-sm italic text-muted-foreground">
            The categories for this product will be applied across the selected product scope.
          </p>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_150px_auto]">
            <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
              <Input value={form.category} onChange={(event) => updateCategory(event.target.value)} placeholder="Type category" />
              <Select value={form.category} onValueChange={updateCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {allCategoryOptions.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex overflow-hidden rounded-md border border-input bg-background">
              <div className="flex w-14 items-center justify-center border-r text-sm font-semibold">%</div>
              <Input
                type="number"
                min="0"
                max="100"
                value={form.category_percent}
                onChange={(event) => setForm({ ...form, category_percent: Number(event.target.value || 0) })}
                className="rounded-none border-0 text-right shadow-none focus-visible:ring-0"
              />
            </div>
            <Button variant="ghost" size="icon" aria-label="Remove category">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <div className="mt-4 max-w-md space-y-2">
            <Label>Accounting Category</Label>
            <Select value={form.accounting_category} onValueChange={(value) => setForm({ ...form, accounting_category: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {getFlattenedCOA().filter(coa => coa.code.startsWith('5')).map(coa => (
                  <SelectItem key={coa.code} value={coa.code}>{coa.code} - {coa.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        <Section title="Product Flags">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border p-4">
              <Checkbox checked={form.is_tax_exempt} onCheckedChange={(checked) => setForm({ ...form, is_tax_exempt: checked === true })} />
              <span className="font-medium">Product should be tax exempt</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border p-4">
              <Checkbox checked={form.is_inventoried} onCheckedChange={(checked) => setForm({ ...form, is_inventoried: checked === true })} />
              <span className="font-medium">Product should be inventoried</span>
            </label>
          </div>
        </Section>

        <Section
          title="Count Sheets"
          action={(
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select value={selectedCountSheetId} onValueChange={setSelectedCountSheetId}>
                <SelectTrigger className="w-64 max-w-full">
                  <SelectValue placeholder="Select count sheet" />
                </SelectTrigger>
                <SelectContent>
                  {countSheetRows.filter(sheet => !sheet.assigned).map(sheet => (
                    <SelectItem key={sheet.id} value={sheet.id}>{sheet.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!selectedCountSheetId || countSheetMutation.isPending}
                onClick={() => {
                  const sheet = countSheetRows.find(row => row.id === selectedCountSheetId);
                  if (sheet) countSheetMutation.mutate({ sheet, action: 'add' });
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add to Count Sheet
              </Button>
            </div>
          )}
        >
          <div className="divide-y rounded-md border">
            {countSheetRows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No active count sheets found for this product scope.</div>
            ) : countSheetRows.map((sheet) => (
              <div key={sheet.id} className="grid gap-3 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div className="min-w-0">
                  <span className="block truncate font-medium">{sheet.name}</span>
                  {sheet.location_id && <span className="text-xs text-muted-foreground">Location sheet</span>}
                </div>
                <Badge variant={sheet.assigned ? 'default' : 'outline'} className="w-fit">
                  {sheet.assigned ? 'Assigned' : 'Not assigned'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={sheet.assigned ? 'Remove count sheet' : 'Add count sheet'}
                  disabled={countSheetMutation.isPending}
                  onClick={() => countSheetMutation.mutate({ sheet, action: sheet.assigned ? 'remove' : 'add' })}
                >
                  {sheet.assigned ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Report & Price Settings">
          <div className="space-y-3">
            <Label>How do you want to see this product on reports? *</Label>
            <div className="grid gap-3 lg:grid-cols-[220px_220px_auto]">
              <Select value={form.report_by_unit} onValueChange={(value) => setForm({ ...form, report_by_unit: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reportUnitOptions.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                <div className="flex w-12 items-center justify-center border-r font-semibold">$</div>
                <Input
                  type="number"
                  step="0.01"
                  value={form.latest_price}
                  onChange={(event) => setForm({
                    ...form,
                    latest_price: Number(event.target.value || 0),
                    report_unit_source_price: Number(event.target.value || 0) * Number(form.report_unit_quantity || 1),
                  })}
                  className="rounded-none border-0 text-right shadow-none focus-visible:ring-0"
                />
              </div>
              <Button onClick={() => setUnitDialogOpen(true)}>
                <Utensils className="mr-2 h-4 w-4" /> Add Unit and Price
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Report price: {money(form.latest_price)} from {money(form.report_unit_source_price)} / {formatQuantity(form.report_unit_quantity)} {form.base_unit || 'unit'}
            </div>
            <p className="text-sm text-muted-foreground">
              Product price and cost unit live here. If recipes use a different unit (for example count vs case), add a conversion rule below.
            </p>
          </div>
        </Section>

        <UnitConversionsManager
          compact
          initialProductId={productId}
          products={productId ? [{
            id: productId,
            name: form.name,
            category: form.category,
            base_unit: form.base_unit,
            report_by_unit: form.report_by_unit,
            latest_price: form.latest_price,
          }] : []}
        />

        <Section
          title={`You buy the following types of '${form.name || 'this product'}':`}
          action={<Button variant="outline">Reassign All</Button>}
        >
          <div className="overflow-auto rounded-md border">
            <table className="w-full min-w-[980px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Vendor Item Name</TableHead>
                  <TableHead>Packaging</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Purchase Date</TableHead>
                  <TableHead>How many</TableHead>
                  <TableHead className="text-right">{form.report_by_unit}</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((row) => (
                  <TableRow key={row}>
                    <TableCell>Current location</TableCell>
                    <TableCell>{row === 1 ? 'Sysco' : row === 2 ? 'US Foods' : 'Gordon Food Service'}</TableCell>
                    <TableCell>{form.name || 'Vendor item'}</TableCell>
                    <TableCell>{form.base_unit || form.report_by_unit}</TableCell>
                    <TableCell className="text-right">{money(form.latest_price)}</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>1</TableCell>
                    <TableCell className="text-right">{money(form.latest_price)}</TableCell>
                    <TableCell className="text-right">0.0%</TableCell>
                    <TableCell><Button variant="link" className="px-0">Reassign</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Vendor mappings are shown as a product-side UI shell. Inventory and vendor mapping hooks can be connected after the related teammate work lands.
          </p>
        </Section>

        <Section
          title="Units Counted on Inventory"
          action={<Button variant="outline" onClick={() => setUnitDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Inventory Units</Button>}
        >
          <div className="overflow-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Name on Inventory</TableHead>
                  <TableHead>Quantity/Unit</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Restricted</TableHead>
                  <TableHead>Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productInventoryItems.length === 0 && countUnitRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Turn on "Product should be inventoried" and save to create the inventory item.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {productInventoryItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{item.product_name || form.name}</TableCell>
                        <TableCell>{formatQuantity(item.current_quantity || 1)} {item.current_unit || form.base_unit || 'Each'}</TableCell>
                        <TableCell className="text-right">{money(item.unit_cost ?? form.latest_price)}</TableCell>
                        <TableCell>{item.restricted ? 'Yes' : 'No'}</TableCell>
                        <TableCell><Badge variant="outline">Inventory linked</Badge></TableCell>
                      </TableRow>
                    ))}
                    {countUnitRows.map(row => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{formatQuantity(row.quantity)} {row.unit}</TableCell>
                        <TableCell className="text-right">{money(row.price)}</TableCell>
                        <TableCell>No</TableCell>
                        <TableCell><Badge variant="outline">Added unit</Badge></TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </table>
          </div>

          <div className="mt-6 space-y-3">
            <h3 className="text-lg font-semibold">Units of Measure</h3>
            <div className="rounded-md border p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="grid gap-3 md:grid-cols-[auto_120px_minmax(140px,1fr)_auto_120px_minmax(140px,1fr)] md:items-center">
                  <span className="font-medium">There are</span>
                  <Input type="number" value={formatQuantity(form.report_unit_quantity || 1)} readOnly />
                  <Input value={form.base_unit || 'Each'} readOnly />
                  <span className="font-medium">in</span>
                  <Input type="number" value="1" readOnly />
                  <Input value={form.report_by_unit || 'Each'} readOnly />
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  {form.report_by_unit || 'Unit'} currently costs {money(form.latest_price)}
                </div>
              </div>
              {countUnitRows.length > 0 && (
                <div className="mt-4 space-y-2">
                  {countUnitRows.map(row => (
                    <div key={`${row.id}:conversion`} className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                      <span>{row.name} is calculated from {money(row.sourcePrice)} per {row.sourceLabel}</span>
                      <span className="font-semibold text-foreground">{money(row.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section title="Barcodes">
          <p className="text-muted-foreground">No items</p>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
            <Button variant="outline" onClick={() => navigate(`/Products/all-products${window.location.search}`)}>
              Cancel
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline"><History className="mr-2 h-4 w-4" /> History</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>How do you want to see this product on reports?</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Enter the source package price, what that package contains, and the unit you want available for inventory counts.
            </p>
            <div className="space-y-2">
              <Label>Source / Package Price</Label>
              <div className="flex max-w-xs overflow-hidden rounded-md border border-input bg-background">
                <div className="flex w-12 items-center justify-center border-r font-semibold">$</div>
                <Input
                  type="number"
                  step="0.01"
                  value={unitDraft.sourcePrice}
                  onChange={(event) => setUnitDraft({ ...unitDraft, sourcePrice: Number(event.target.value || 0) })}
                  className="rounded-none border-0 text-right shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source package contains</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={unitDraft.sourceQuantity}
                  onChange={(event) => setUnitDraft({ ...unitDraft, sourceQuantity: Number(event.target.value || 0) })}
                />
                <Select value={unitDraft.sourceUnit} onValueChange={(value) => setUnitDraft({ ...unitDraft, sourceUnit: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PRODUCT_UNIT_OPTIONS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Add count unit</Label>
              <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_1.2fr]">
                <Input
                  value={unitDraft.nickname}
                  onChange={(event) => setUnitDraft({ ...unitDraft, nickname: event.target.value })}
                  placeholder="Name, e.g. Half Case or 1 lb"
                />
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={unitDraft.targetQuantity}
                  onChange={(event) => setUnitDraft({ ...unitDraft, targetQuantity: Number(event.target.value || 0) })}
                />
                <Select value={unitDraft.targetUnit} onValueChange={(value) => setUnitDraft({ ...unitDraft, targetUnit: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PRODUCT_UNIT_OPTIONS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={unitDraft.makePrimary}
                onCheckedChange={(checked) => setUnitDraft({ ...unitDraft, makePrimary: Boolean(checked) })}
              />
              <span>Also make this the primary report/inventory unit for this product</span>
            </label>
            <Separator />
            <div className="rounded-md bg-muted/60 p-4">
              <p className="text-sm font-medium text-foreground">
                {money(unitDraft.sourcePrice)} per {formatQuantity(unitDraft.sourceQuantity)} {unitDraft.sourceUnit}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {convertedUnit.canConvert ? money(convertedPrice) : 'Cannot convert'} for {formatQuantity(unitDraft.targetQuantity)} {unitDraft.targetUnit || 'unit'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {convertedUnit.canConvert
                  ? `Added unit label: ${buildReportUnitLabel(unitDraft.targetQuantity, unitDraft.targetUnit, unitDraft.nickname)}`
                  : convertedUnit.reason}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyUnitDraft}>Add Unit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
