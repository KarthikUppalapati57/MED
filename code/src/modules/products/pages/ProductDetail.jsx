import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  getProductUnitDefinition,
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

const PACKAGE_UNIT_OPTIONS = PRODUCT_UNIT_OPTIONS.filter(
  unit => getProductUnitDefinition(unit).family === 'package'
);

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatQuantity(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function buildReportUnitLabel(quantity, unit) {
  const trimmedUnit = String(unit || '').trim() || 'Each';
  return `${formatQuantity(quantity || 1)} ${trimmedUnit}`;
}

function buildCountUnitLabel({ quantity, unit, sourceQuantity, sourceUnit }) {
  const label = buildReportUnitLabel(quantity, unit);
  const definition = getProductUnitDefinition(unit);
  if (definition.family !== 'package') return label;
  const sourceAmount = Number(sourceQuantity || 0);
  if (sourceAmount <= 0 || !sourceUnit) return label;
  return `${label} (${formatQuantity(sourceAmount)} ${compactUnitLabel(sourceUnit)})`;
}

function compactUnitLabel(unit) {
  const normalized = String(unit || '').trim().toLowerCase();
  const labels = {
    pound: 'lb',
    pounds: 'lb',
    ounce: 'oz',
    ounces: 'oz',
    'fluid ounce': 'fl oz',
    'fluid ounces': 'fl oz',
    gallon: 'gal',
    gallons: 'gal',
    quart: 'qt',
    quarts: 'qt',
    liter: 'l',
    litre: 'l',
    milliliter: 'ml',
    millilitre: 'ml',
    kilogram: 'kg',
    gram: 'g',
    each: 'ea',
  };
  return labels[normalized] || String(unit || 'unit').trim() || 'unit';
}

function buildMasterUnitLabel(reportUnit, quantity, contentsUnit) {
  const masterUnit = String(reportUnit || '').trim() || 'Each';
  const amount = Number(quantity || 1);
  const innerUnit = String(contentsUnit || '').trim();
  const sameUnit = masterUnit.toLowerCase() === innerUnit.toLowerCase();
  if (!innerUnit || (sameUnit && amount === 1) || /\([^)]*\)/.test(masterUnit)) {
    return masterUnit;
  }
  return `${masterUnit} (${formatQuantity(amount)} ${compactUnitLabel(innerUnit)})`;
}

function buildInventoryUnitLabel(form) {
  const reportUnit = form.report_by_unit || form.base_unit || 'Each';
  return buildMasterUnitLabel(reportUnit, form.report_unit_quantity || 1, form.base_unit || reportUnit);
}

function inferPackageUnitFromText(...values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (!text) return '';
  return PACKAGE_UNIT_OPTIONS.find(unit => {
    const normalized = unit.toLowerCase();
    if (new RegExp(`\\b${normalized}s?\\b`).test(text)) return true;
    if (normalized === 'case' && /\b(cs|case)\b/.test(text)) return true;
    if (normalized === 'box' && /\b(bx|box)\b/.test(text)) return true;
    if (normalized === 'bag' && /\b(bg|bag)\b/.test(text)) return true;
    if (normalized === 'pack' && /\b(pk|pack)\b/.test(text)) return true;
    return false;
  }) || '';
}

function getFallbackPackageUnit() {
  return PACKAGE_UNIT_OPTIONS[0] || '';
}

function getInitialPackageReportUnit(product, ...packageLabels) {
  const reportUnit = product?.report_by_unit || '';
  if (getProductUnitDefinition(reportUnit).family === 'package') return reportUnit;
  return inferPackageUnitFromText(...packageLabels, product?.pack_size, product?.vendor_unit, product?.base_unit)
    || getFallbackPackageUnit();
}

function getDefaultSourcePackage(form) {
  const quantity = Number(form.report_unit_quantity || 0);
  const sourcePrice = Number(form.report_unit_source_price || 0);
  const latestPrice = Number(form.latest_price || 0);
  if (quantity > 0 && form.base_unit) {
    return {
      quantity: quantity < 1 && sourcePrice > latestPrice ? 1 : quantity,
      unit: form.base_unit,
    };
  }
  const parsed = parsePackageContents(form.report_by_unit) || parsePackageContents(form.base_unit);
  if (parsed) return parsed;
  return {
    quantity: 1,
    unit: form.base_unit || form.report_by_unit || 'Each',
  };
}

function buildSourcePackageLabel(quantity, unit) {
  const numericQuantity = Number(quantity || 1);
  const unitLabel = String(unit || 'Each').trim() || 'Each';
  if (numericQuantity === 1) return unitLabel;
  return `${formatQuantity(numericQuantity)} ${unitLabel}`;
}

function countSheetItemKey(item = {}) {
  const safeItem = item || {};
  if (safeItem.product_count_unit_id) return `count-unit:${safeItem.product_count_unit_id}`;
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

function isCountSheetItemForProduct(item = {}, product = {}, inventoryItem = {}) {
  const itemKey = countSheetItemKey(item);
  if (itemKey === productInventoryKey(product, inventoryItem)) return true;
  if (item.internal_product_id && item.internal_product_id === product?.id) return true;
  if (item.product_id && [product?.id, product?.product_id, inventoryItem?.product_id].filter(Boolean).includes(item.product_id)) return true;
  if (item.inventory_id && inventoryItem?.id && item.inventory_id === inventoryItem.id) return true;
  return false;
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
  const routerLocation = useLocation();
  const { '*': splat } = useParams();
  const productId = suppliedProductId || splat?.split('/')[1] || initialProduct?.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => buildForm(initialProduct));
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [pendingReportUnitOption, setPendingReportUnitOption] = useState(null);
  const [unitDraft, setUnitDraft] = useState({
    sourceQuantity: 1,
    sourceUnit: initialProduct?.base_unit || initialProduct?.report_by_unit || 'Each',
    targetQuantity: 1,
    targetUnit: getInitialPackageReportUnit(initialProduct),
    sourcePrice: Number(initialProduct?.report_unit_source_price ?? initialProduct?.latest_price ?? 0),
  });
  const [countUnitRows, setCountUnitRows] = useState([]);
  const [sourcePackLabel, setSourcePackLabel] = useState('');
  const [packageReportUnit, setPackageReportUnit] = useState(() => getInitialPackageReportUnit(initialProduct));
  const [sourcePackagePrice, setSourcePackagePrice] = useState(Number(initialProduct?.report_unit_source_price ?? initialProduct?.latest_price ?? 0));
  const [selectedCountSheetId, setSelectedCountSheetId] = useState('');
  const backTarget = routerLocation.state?.from || `/Products/all-products${window.location.search}`;

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

  const { data: productLineItems = [] } = useAuthQuery({
    queryKey: ['product-detail-line-packs', product?.organization_id, product?.id],
    queryFn: async () => {
      if (!product?.organization_id || !product?.id) return [];
      const { data, error } = await api.client
        .from('invoice_line_items')
        .select('id, item_name, pack_size, vendor_unit, unit_price, total_price, quantity, created_at')
        .eq('organization_id', product.organization_id)
        .eq('internal_product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!product?.organization_id && !!product?.id,
  });

  const { data: savedCountUnits = [] } = useAuthQuery({
    queryKey: ['product-detail-count-units', product?.id],
    queryFn: () => api.products.listCountUnits(product.id),
    enabled: !!product?.id,
  });

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
        ? items.filter(item => !isCountSheetItemForProduct(item, product, inventoryItem))
        : [
            ...items.filter(item => countSheetItemKey(item) !== productCountSheetKey),
            {
              inventory_id: inventoryItem?.id || product.id,
              internal_product_id: product.id,
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
    const sourcePackage = getDefaultSourcePackage(nextForm);
    setForm(nextForm);
    setSourcePackLabel(buildSourcePackageLabel(sourcePackage.quantity, sourcePackage.unit));
    const inferredPackageUnit = getInitialPackageReportUnit(product, buildSourcePackageLabel(sourcePackage.quantity, sourcePackage.unit));
    if (getProductUnitDefinition(nextForm.report_by_unit).family === 'package') {
      setPackageReportUnit(nextForm.report_by_unit);
    } else if (inferredPackageUnit) {
      setPackageReportUnit(inferredPackageUnit);
    }
    setSourcePackagePrice(nextForm.report_unit_source_price || nextForm.latest_price || 0);
    setUnitDraft({
      sourceQuantity: sourcePackage.quantity,
      sourceUnit: sourcePackage.unit,
      targetQuantity: 1,
      targetUnit: getProductUnitDefinition(nextForm.report_by_unit).family === 'package'
        ? nextForm.report_by_unit
        : inferredPackageUnit,
      sourcePrice: nextForm.report_unit_source_price || nextForm.latest_price || 0,
    });
  }, [product]);

  useEffect(() => {
    setCountUnitRows((savedCountUnits || []).map(row => ({
      id: row.id,
      name: row.name,
      quantity: Number(row.quantity || 1),
      unit: row.unit,
      price: Number(row.unit_price || 0),
      sourceQuantity: Number(row.source_quantity || 1),
      sourceUnit: row.source_unit || 'unit',
      sourceLabel: `${formatQuantity(row.source_quantity || 1)} ${row.source_unit || 'unit'}`,
      sourcePrice: Number(row.source_price || 0),
      persisted: true,
    })));
  }, [savedCountUnits]);

  const allCategoryOptions = useMemo(() => {
    const categories = new Set([
      ...DEFAULT_CATEGORIES,
      ...categoryOptions.filter(Boolean),
      form.category,
    ]);
    return [...categories].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [categoryOptions, form.category]);

  useEffect(() => {
    const latestPack = productLineItems.find(item => item.pack_size || item.vendor_unit);
    const packLabel = latestPack?.pack_size || latestPack?.vendor_unit;
    const parsed = parsePackageContents(packLabel);
    if (!parsed) return;
    const inferredPackageUnit = inferPackageUnitFromText(packLabel) || packageReportUnit || getFallbackPackageUnit();
    setPackageReportUnit(inferredPackageUnit);
    setSourcePackLabel(packLabel);
    setUnitDraft(current => ({
      ...current,
      sourceQuantity: parsed.quantity,
      sourceUnit: parsed.unit,
      targetUnit: getProductUnitDefinition(current.targetUnit).family === 'package'
        ? current.targetUnit
        : inferredPackageUnit,
    }));
  }, [packageReportUnit, productLineItems]);

  const sourcePackage = useMemo(() => {
    return parsePackageContents(sourcePackLabel) || {
      quantity: Number(unitDraft.sourceQuantity || 1),
      unit: unitDraft.sourceUnit || form.base_unit || 'Each',
    };
  }, [form.base_unit, sourcePackLabel, unitDraft.sourceQuantity, unitDraft.sourceUnit]);

  const masterDisplayPackage = useMemo(() => {
    const masterUnit = form.report_by_unit || form.base_unit || 'Each';
    const masterDefinition = getProductUnitDefinition(masterUnit);
    if (masterDefinition.family === 'package' && sourcePackage.quantity > 0 && sourcePackage.unit) {
      return sourcePackage;
    }
    return {
      quantity: Number(form.report_unit_quantity || 1),
      unit: form.base_unit || masterUnit,
    };
  }, [form.base_unit, form.report_by_unit, form.report_unit_quantity, sourcePackage]);

  const reportUnitOptions = useMemo(() => {
    const sourcePrice = Number(sourcePackagePrice || form.report_unit_source_price || form.latest_price || 0);
    const contentUnitPrice = calculateConvertedInventoryUnit({
      sourcePrice,
      sourceQuantity: sourcePackage.quantity,
      sourceUnit: sourcePackage.unit,
      targetQuantity: 1,
      targetUnit: sourcePackage.unit,
    });
    const options = [
      packageReportUnit ? {
        value: packageReportUnit,
        label: buildMasterUnitLabel(packageReportUnit, sourcePackage.quantity, sourcePackage.unit),
        reportUnit: packageReportUnit,
        quantity: sourcePackage.quantity,
        unit: sourcePackage.unit,
        price: sourcePrice,
        sourcePrice,
      } : null,
      getProductUnitDefinition(form.report_by_unit).family === 'package' ? null : {
        value: form.report_by_unit || 'Each',
        label: buildMasterUnitLabel(form.report_by_unit, masterDisplayPackage.quantity, masterDisplayPackage.unit),
        reportUnit: form.report_by_unit || 'Each',
        quantity: Number(form.report_unit_quantity || 1),
        unit: form.base_unit || form.report_by_unit || 'Each',
        price: Number(form.latest_price || 0),
        sourcePrice: Number(form.report_unit_source_price || form.latest_price || 0),
      },
      {
        value: sourcePackage.unit,
        label: sourcePackage.unit,
        reportUnit: sourcePackage.unit,
        quantity: 1,
        unit: sourcePackage.unit,
        price: contentUnitPrice.canConvert ? contentUnitPrice.price : Number(form.latest_price || 0),
        sourcePrice: contentUnitPrice.canConvert ? contentUnitPrice.price : Number(form.latest_price || 0),
      },
    ];
    return [...new Map(options.filter(option => option?.value).map(option => [String(option.value).toLowerCase(), option])).values()];
  }, [form.base_unit, form.latest_price, form.report_by_unit, form.report_unit_quantity, form.report_unit_source_price, masterDisplayPackage.quantity, masterDisplayPackage.unit, packageReportUnit, sourcePackage.quantity, sourcePackage.unit, sourcePackagePrice]);

  const applyReportUnitChange = (option) => {
    if (!option) return;
    if (!option.quantity || !option.unit) {
      setForm(current => ({ ...current, report_by_unit: option.reportUnit || option.value || option.label }));
      return;
    }
    setForm(current => ({
      ...current,
      report_by_unit: option.reportUnit || option.value || option.label,
      base_unit: option.unit,
      report_unit_quantity: option.quantity,
      report_unit_source_price: option.sourcePrice,
      latest_price: option.price,
    }));
    toast.info('Master unit changed. Save the product to apply it everywhere.');
  };

  const handleReportUnitChange = (value) => {
    const option = reportUnitOptions.find(row => row.value === value);
    const nextOption = option || { value, label: value, reportUnit: value };
    const currentValue = String(form.report_by_unit || '').trim().toLowerCase();
    const nextValue = String(nextOption.reportUnit || nextOption.value || nextOption.label || '').trim().toLowerCase();
    if (currentValue === nextValue) {
      return;
    }
    setPendingReportUnitOption(nextOption);
  };

  const convertedUnit = useMemo(() => calculateConvertedInventoryUnit({
    sourcePrice: unitDraft.sourcePrice,
    sourceQuantity: unitDraft.sourceQuantity,
    sourceUnit: unitDraft.sourceUnit,
    targetQuantity: unitDraft.targetQuantity,
    targetUnit: unitDraft.targetUnit,
  }), [unitDraft.sourcePrice, unitDraft.sourceQuantity, unitDraft.sourceUnit, unitDraft.targetQuantity, unitDraft.targetUnit]);
  const convertedPrice = convertedUnit.price;
  const inventorySyncUnit = sourcePackage.quantity > 1 && packageReportUnit
    ? packageReportUnit
    : form.report_by_unit || form.base_unit || 'Each';
  const inventoryDisplayUnit = sourcePackage.quantity > 1 && packageReportUnit
    ? buildMasterUnitLabel(packageReportUnit, sourcePackage.quantity, sourcePackage.unit)
    : buildInventoryUnitLabel(form);

  const resetUnitDraft = () => {
    setSourcePackLabel(buildSourcePackageLabel(sourcePackage.quantity, sourcePackage.unit));
    setUnitDraft({
      sourceQuantity: sourcePackage.quantity,
      sourceUnit: sourcePackage.unit,
      targetQuantity: 1,
      targetUnit: packageReportUnit || getFallbackPackageUnit(),
      sourcePrice: sourcePackagePrice || form.report_unit_source_price || form.latest_price || 0,
    });
  };

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
            current_unit: inventorySyncUnit,
            report_by: inventorySyncUnit,
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

  const countUnitMutation = useMutation({
    mutationFn: (row) => {
      if (!product?.id || !product?.organization_id) {
        throw new Error('Save the product before adding count units');
      }
      return api.products.upsertCountUnit({
        organization_id: product.organization_id,
        brand_id: product.brand_id || null,
        location_id: product.location_id || null,
        product_id: product.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.price,
        source_quantity: row.sourceQuantity,
        source_unit: row.sourceUnit,
        source_price: row.sourcePrice,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-detail-count-units', product?.id] });
      queryClient.invalidateQueries({ queryKey: ['product-detail-inventory', product?.id, product?.product_id] });
      queryClient.invalidateQueries({ queryKey: ['count-sheet-draft-count-units'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      toast.success('Count unit saved');
      setUnitDialogOpen(false);
    },
    onError: (error) => toast.error(error?.message || 'Unable to save count unit'),
  });

  const removeCountUnitMutation = useMutation({
    mutationFn: (row) => api.products.removeCountUnit(row.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-detail-count-units', product?.id] });
      queryClient.invalidateQueries({ queryKey: ['product-detail-inventory', product?.id, product?.product_id] });
      queryClient.invalidateQueries({ queryKey: ['count-sheet-draft-count-units'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      toast.success('Count unit removed');
    },
    onError: (error) => toast.error(error?.message || 'Unable to remove count unit'),
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
    const label = buildCountUnitLabel({
      quantity: unitDraft.targetQuantity,
      unit: unitDraft.targetUnit,
      sourceQuantity: unitDraft.sourceQuantity,
      sourceUnit: unitDraft.sourceUnit,
    });
    const nextRow = {
      id: `draft-unit:${Date.now()}`,
      name: label,
      quantity: Number(unitDraft.targetQuantity || 1),
      unit: unitDraft.targetUnit,
      price: convertedPrice,
      sourceQuantity: Number(unitDraft.sourceQuantity || 1),
      sourceUnit: unitDraft.sourceUnit,
      sourceLabel: `${formatQuantity(unitDraft.sourceQuantity)} ${unitDraft.sourceUnit}`,
      sourcePrice: Number(unitDraft.sourcePrice || 0),
    };
    countUnitMutation.mutate(nextRow);
  };

  if (isLoading && !product) {
    return <div className="p-8 text-muted-foreground">Loading product...</div>;
  }

  if (!product) {
    return (
      <div className="space-y-4 p-8">
        <Button variant="ghost" onClick={() => navigate(backTarget)}>
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
          <Button variant="ghost" className="mb-2 px-0" onClick={() => navigate(backTarget)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="truncate text-3xl font-bold tracking-normal text-foreground">{form.name || 'Edit Product'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{form.product_id || 'No Product ID'} - Master product management</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(backTarget)}>
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
              <Select value={form.report_by_unit} onValueChange={handleReportUnitChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reportUnitOptions.map(unit => <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                <div className="flex w-12 items-center justify-center border-r font-semibold">$</div>
                <Input
                  type="number"
                  step="0.01"
                  value={form.latest_price}
                  onChange={(event) => {
                    const nextPrice = Number(event.target.value || 0);
                    if (getProductUnitDefinition(form.report_by_unit).family === 'package') {
                      setSourcePackagePrice(nextPrice);
                    }
                    setForm({
                      ...form,
                      latest_price: nextPrice,
                      report_unit_source_price: nextPrice,
                    });
                  }}
                  className="rounded-none border-0 text-right shadow-none focus-visible:ring-0"
                />
              </div>
              <Button onClick={() => setUnitDialogOpen(true)}>
                <Utensils className="mr-2 h-4 w-4" /> Add Count Unit
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Report price: {money(form.latest_price)} per {buildMasterUnitLabel(form.report_by_unit, masterDisplayPackage.quantity, masterDisplayPackage.unit)}
            </div>
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[220px_1fr] md:items-end">
              <div className="space-y-2">
                <Label>Pack</Label>
                <Input
                  value={sourcePackLabel}
                  onChange={(event) => {
                    const value = event.target.value;
                    const parsed = parsePackageContents(value);
                    setSourcePackLabel(value);
                    if (parsed) {
                      const inferredPackageUnit = inferPackageUnitFromText(value) || packageReportUnit || getFallbackPackageUnit();
                      setPackageReportUnit(inferredPackageUnit);
                      setUnitDraft(current => ({
                        ...current,
                        sourceQuantity: parsed.quantity,
                        sourceUnit: parsed.unit,
                        targetUnit: getProductUnitDefinition(current.targetUnit).family === 'package'
                          ? current.targetUnit
                          : inferredPackageUnit,
                      }));
                    }
                  }}
                  placeholder="e.g. 3 GA, 6/12 EA, Case (40 lb)"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Pack is the source package from invoice extraction. It is used to calculate count units and prices.
              </p>
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
                {(productLineItems.length ? productLineItems : [null]).map((line, index) => (
                  <TableRow key={line?.id || `empty-line-${index}`}>
                    <TableCell>Current location</TableCell>
                    <TableCell>{line ? 'Invoice line' : 'No recent vendor lines'}</TableCell>
                    <TableCell>{line?.item_name || form.name || 'Vendor item'}</TableCell>
                    <TableCell>
                      {line?.pack_size || line?.vendor_unit || form.base_unit || form.report_by_unit}
                      {(line?.pack_size || line?.vendor_unit) && (
                        <Button
                          variant="link"
                          className="ml-2 h-auto px-0 text-xs"
                          onClick={() => {
                            const pack = line.pack_size || line.vendor_unit;
                            const parsed = parsePackageContents(pack);
                            setSourcePackLabel(pack);
                            if (parsed) {
                              const inferredPackageUnit = inferPackageUnitFromText(pack) || packageReportUnit || getFallbackPackageUnit();
                              setPackageReportUnit(inferredPackageUnit);
                              setUnitDraft(current => ({
                                 ...current,
                                 sourceQuantity: parsed.quantity,
                                 sourceUnit: parsed.unit,
                                 targetUnit: inferredPackageUnit,
                               }));
                             }
                           }}
                        >
                          Use pack
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{money(line?.unit_price ?? form.latest_price)}</TableCell>
                    <TableCell>{line?.created_at ? new Date(line.created_at).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{formatQuantity(line?.quantity || 1)}</TableCell>
                    <TableCell className="text-right">{money(line?.unit_price ?? form.latest_price)}</TableCell>
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
                    <TableCell>{formatQuantity(item.current_quantity || 1)} {inventoryDisplayUnit || item.current_unit || form.base_unit || 'Each'}</TableCell>
                    <TableCell className="text-right">{money(item.unit_cost ?? form.latest_price)}</TableCell>
                    <TableCell>{item.restricted ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Button variant="link" className="h-auto px-0" onClick={() => navigate(`/Inventory${window.location.search}`)}>
                        Edit in Inventory
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                    {countUnitRows.map(row => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{buildCountUnitLabel(row)}</TableCell>
                        <TableCell className="text-right">{money(row.price)}</TableCell>
                        <TableCell>No</TableCell>
                        <TableCell className="space-x-2">
                          <Button variant="link" className="h-auto px-0" onClick={() => navigate(`/Inventory${window.location.search}`)}>
                            View Inventory
                          </Button>
                          <Button
                            variant="link"
                            className="h-auto px-0 text-destructive"
                            disabled={removeCountUnitMutation.isPending}
                            onClick={() => removeCountUnitMutation.mutate(row)}
                          >
                            Remove
                          </Button>
                        </TableCell>
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
                  <Input value={buildMasterUnitLabel(form.report_by_unit, masterDisplayPackage.quantity, masterDisplayPackage.unit)} readOnly />
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  {buildMasterUnitLabel(form.report_by_unit, masterDisplayPackage.quantity, masterDisplayPackage.unit)} currently costs {money(form.latest_price)}
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

      <AlertDialog open={Boolean(pendingReportUnitOption)} onOpenChange={(open) => {
        if (!open) setPendingReportUnitOption(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change master report unit?</AlertDialogTitle>
            <AlertDialogDescription>
              This changes the product's official report unit from {form.report_by_unit || form.base_unit || 'the current unit'} to {pendingReportUnitOption?.label || 'the selected unit'}. It can affect Master Catalog, Purchase Report, product pricing, inventory value, stock counts, and count sheets. Extra inventory count units will stay available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingReportUnitOption(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                applyReportUnitChange(pendingReportUnitOption);
                setPendingReportUnitOption(null);
              }}
            >
              Change Master Unit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={unitDialogOpen} onOpenChange={(open) => {
        setUnitDialogOpen(open);
        resetUnitDraft();
      }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add an inventory count unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Enter the package price, what the package contains, and the quantity/unit you want available for counting. This does not change the product master report unit.
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
              <Label>Pack</Label>
              <Input
                value={sourcePackLabel}
                onChange={(event) => {
                  const value = event.target.value;
                  const parsed = parsePackageContents(value);
                  setSourcePackLabel(value);
                  if (parsed) {
                    const inferredPackageUnit = inferPackageUnitFromText(value) || packageReportUnit || getFallbackPackageUnit();
                    setPackageReportUnit(inferredPackageUnit);
                    setUnitDraft(current => ({
                      ...current,
                      sourceQuantity: parsed.quantity,
                      sourceUnit: parsed.unit,
                      targetUnit: getProductUnitDefinition(current.targetUnit).family === 'package'
                        ? current.targetUnit
                        : inferredPackageUnit,
                    }));
                  }
                }}
                placeholder="e.g. 3 GA, 6/12 EA, Case (40 lb)"
              />
            </div>
            <div className="space-y-2">
              <Label>Package type</Label>
              <Select
                value={packageReportUnit}
                onValueChange={(value) => {
                  setPackageReportUnit(value);
                  setUnitDraft(current => ({
                    ...current,
                    targetUnit: getProductUnitDefinition(current.targetUnit).family === 'package'
                      ? value
                      : current.targetUnit,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PACKAGE_UNIT_OPTIONS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <Label>Count by</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
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
                  ? `Added count unit: ${buildCountUnitLabel({
                      quantity: unitDraft.targetQuantity,
                      unit: unitDraft.targetUnit,
                      sourceQuantity: unitDraft.sourceQuantity,
                      sourceUnit: unitDraft.sourceUnit,
                    })}. Master report unit remains ${form.report_by_unit || form.base_unit || 'Each'}.`
                  : convertedUnit.reason}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyUnitDraft} disabled={countUnitMutation.isPending}>
              {countUnitMutation.isPending ? 'Saving...' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
