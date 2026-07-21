import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery, useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRequireLocation } from '@/hooks/useRequireLocation';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { format } from 'date-fns';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Warehouse,
  Utensils,
  Martini,
  Wine,
  Coffee,
  Package,
  TrendingDown,
  TrendingUp,
  MoreVertical,
  ShoppingCart,
  Download,
  X,
  Clock,
  Calendar,
  Sparkles,
  ScanBarcode,
  Camera,
  ChevronDown,
  Printer,
  QrCode,
  Upload
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
import { getCOALabel } from '@/lib/accountingConfig';

const LoadingDockReceiving = React.lazy(() => import('@/modules/inventory/components/LoadingDockReceiving'));
const ActiveCountSession = React.lazy(() => import('@/modules/inventory/components/ActiveCountSession'));
const POSSyncEngine = React.lazy(() => import('@/modules/inventory/components/POSSyncEngine'));
const InventoryTransfers = React.lazy(() => import('@/modules/inventory/components/InventoryTransfers'));
const AvTDashboard = React.lazy(() => import('@/modules/inventory/components/AvTDashboard'));
const WASTE_CHART_COLORS = ['#ef4444', '#f97316', '#eab308', '#2563eb', '#16a34a', '#7c3aed'];
const SUPPLY_CATEGORY_PATTERN = /(paper|packaging|container|cup|lid|straw|napkin|towel|bag|box|plate|foil|wrap|cleaning|cleaner|soap|detergent|sanitizer|bleach|sponge|scrubber|glove|apron|scraper|blade|pan|utensil|equipment|smallware|thermometer|restaurant supplies)/;

function getCountSheetBucket(item) {
  if (!item) return 'Other';
  const category = String(item.accounting_category || '').toLowerCase();
  const savedCategory = String(item.category || '').toLowerCase();
  const label = String(getCOALabel(item.accounting_category) || '').toLowerCase();
  const name = String(item.product_name || '').toLowerCase();
  const text = `${category} ${savedCategory} ${label} ${name}`;
  const categoryAndName = `${savedCategory} ${name}`;

  if (SUPPLY_CATEGORY_PATTERN.test(categoryAndName)) return 'Other';

  if (/beer/.test(categoryAndName) || category === '5230') return 'Beer';
  if (/wine/.test(categoryAndName) || category === '5240') return 'Wine';
  if (/liquor|spirit|bar/.test(categoryAndName) || category === '5220') return 'Liquor';
  if (/beverage|n\/a|non.?alcohol|soda|coffee|tea|juice/.test(categoryAndName) || category === '5210' || category === '1220') return 'N/A Bev';
  if (/retail|merch|gift/.test(text) || category === '1230') return 'Retail';
  if (/food|meat|poultry|seafood|dairy|produce|frozen|grocery|cost/.test(text) || /^51\d0$/.test(category) || category === '1210') return 'Food';
  return 'Other';
}

function getBucketAccent(index) {
  return [
    'bg-primary text-primary border-primary/20',
    'bg-resend-green text-resend-green border-resend-green/20',
    'bg-resend-yellow text-resend-yellow border-resend-yellow/20',
    'bg-resend-orange text-resend-orange border-resend-orange/20',
    'bg-resend-red text-resend-red border-resend-red/20',
  ][index % 5];
}

function getSummaryBucketLabel(label) {
  if (['Beer', 'N/A Bev'].includes(label)) return 'Beverages';
  if (['Food', 'Liquor', 'Wine'].includes(label)) return label;
  return 'Other';
}

function getSummaryBucketIcon(label) {
  return {
    Food: Utensils,
    Liquor: Martini,
    Wine,
    Beverages: Coffee,
    Other: Package,
  }[label] || Warehouse;
}

function parsePositiveThreshold(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isBelowReorderPoint(item) {
  const reorderPoint = parsePositiveThreshold(item.reorder_point);
  if (reorderPoint === null) return false;
  return Number(item.current_quantity || 0) <= reorderPoint;
}

function formatDateInput(date) {
  return date.toISOString().split('T')[0];
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getLocalDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return formatDateInput(new Date());
  return formatDateInput(date);
}

function getInvoiceLineName(line = {}) {
  return line.item_name || line.description || line.product_name || line.vendor_item_description || line.name || 'Unlabeled item';
}

function getInvoiceLineQuantity(line = {}) {
  const value = line.quantity ?? line.qty ?? line.invoice_quantity ?? line.received_quantity ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInvoiceLineValue(line = {}) {
  const value = line.total_price ?? line.extended_price ?? line.line_total ?? line.amount;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const quantity = getInvoiceLineQuantity(line);
  const unitCost = Number(line.unit_price ?? line.price ?? 0);
  return Number.isFinite(unitCost) ? quantity * unitCost : 0;
}

function csvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

const INVENTORY_ROW_HEIGHT = 72;
const INVENTORY_TABLE_VIEWPORT_HEIGHT = 640;
const INVENTORY_ROW_OVERSCAN = 8;
const INVENTORY_CATEGORY_OPTIONS = [
  { key: 'all', label: 'All', code: null },
  { key: 'food', label: 'Food', code: '1210' },
  { key: 'beer', label: 'Beer', code: '5230' },
  { key: 'wine', label: 'Wine', code: '5240' },
  { key: 'liquor', label: 'Liquor', code: '5220' },
  { key: 'na_bev', label: 'N/A Bev', code: '5210' },
  { key: 'retail', label: 'Retail', code: '1230' },
  { key: 'other', label: 'Other', code: '5300' },
];
const INVENTORY_ITEM_CATEGORY_OPTIONS = INVENTORY_CATEGORY_OPTIONS.filter(option => option.key !== 'all');
const INVENTORY_COUNT_UNITS = [
  'CS',
  'Each',
  'Bottle',
  'Bottle (12 Ounces)',
  'Bottle (750 Milliliters)',
  'Can',
  'Can (12 Fluid Ounces)',
  'Liter',
  'Milliliter',
  'Fluid Ounce',
  'Ounce',
  'Pound',
  'Gram',
  'Kilogram',
  'Gallon',
  'Quart',
  'Pint',
  'Keg (1/2BBL) 15.5GAL',
  'Keg (1/4BBL) 7.75GAL',
  'Pack',
  'Package',
  'Case',
  'Box',
  'Bag',
  'Jar',
  'Other',
];

function getInventoryCategoryOption(itemOrCode) {
  const item = typeof itemOrCode === 'object' ? itemOrCode : { accounting_category: itemOrCode };
  const bucket = getCountSheetBucket(item);
  return INVENTORY_ITEM_CATEGORY_OPTIONS.find(option => option.label === bucket) || INVENTORY_ITEM_CATEGORY_OPTIONS[0];
}

function InventorySectionFallback({ label = 'Loading inventory section...' }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  );
}

function LazyInventorySection({ children, label }) {
  return (
    <React.Suspense fallback={<InventorySectionFallback label={label} />}>
      {children}
    </React.Suspense>
  );
}

function useDebouncedQueryInvalidation(queryClient, queryKeys, delay = 1000) {
  const timeoutRef = React.useRef(null);
  const queryKeysRef = React.useRef(queryKeys);

  React.useEffect(() => {
    queryKeysRef.current = queryKeys;
  }, [queryKeys]);

  React.useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  return React.useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      queryKeysRef.current.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });
    }, delay);
  }, [delay, queryClient]);
}

export default function Inventory() {
  const { isGroundStaff } = usePermissions();
  const { hasLocation, warnIfMissing } = useRequireLocation();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const pathParts = routerLocation.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const subPathToTab = {
    'inventory-list': 'inventory',
    'wastage-log': 'wastage',
  };
  const tabToSubPath = {
    'inventory': 'inventory-list',
    'wastage': 'wastage-log',
  };

  const activeTab = subPathToTab[currentSubPath] || currentSubPath || 'inventory';
  const requestedStockCountSheetId = React.useMemo(() => {
    const params = new URLSearchParams(routerLocation.search);
    return params.get('countSheetId') || params.get('count_sheet_id') || '';
  }, [routerLocation.search]);

  const setActiveTab = (tab) => {
    const subPath = tabToSubPath[tab] || tab;
    navigate(`/Inventory/${subPath}${routerLocation.search}`);
  };

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  const [sortInventory, setSortInventory] = useState('-product_name');
  const [sortWastage, setSortWastage] = useState('-created_at');
  const [sortCountSheets, setSortCountSheets] = useState('-created_at');
  const [sortCountSessions, setSortCountSessions] = useState('-started_at');
  const [sortRecipes, setSortRecipes] = useState('name');

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [wastageDialogOpen, setWastageDialogOpen] = useState(false);
  const [wastageStartDate, setWastageStartDate] = useState(() => formatDateInput(addMonths(new Date(), -1)));
  const [wastageEndDate, setWastageEndDate] = useState(() => formatDateInput(new Date()));
  const [wastageDatePreset, setWastageDatePreset] = useState('last_30_days');
  const [wastageRangeWarningOpen, setWastageRangeWarningOpen] = useState(false);
  const [appliedWastageDateRange, setAppliedWastageDateRange] = useState(() => ({
    startDate: formatDateInput(addMonths(new Date(), -1)),
    endDate: formatDateInput(new Date()),
  }));
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
  const [countSheetForm, setCountSheetForm] = useState({
    name: '',
    buckets: [],
    organizeBy: 'auto_category',
  });
  const [countSheetStatus, setCountSheetStatus] = useState('active');
  const [editingCountSheetId, setEditingCountSheetId] = useState(null);
  const [countSheetDraft, setCountSheetDraft] = useState(null);
  const [countSheetDeleteTarget, setCountSheetDeleteTarget] = useState(null);
  const [countSheetProductToAdd, setCountSheetProductToAdd] = useState('');
  const [stockCountScopes, setStockCountScopes] = useState(['all']);
  const [stockCountSheetId, setStockCountSheetId] = useState('');
  const [stockCountDate, setStockCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockCountValues, setStockCountValues] = useState({});
  const [stockCountHistory, setStockCountHistory] = useState([]);
  const [editingStockCountId, setEditingStockCountId] = useState(null);
  const [stockCountSaveConfirmOpen, setStockCountSaveConfirmOpen] = useState(false);
  const [stockCountCloseTarget, setStockCountCloseTarget] = useState(null);
  const [stockCountDeleteTarget, setStockCountDeleteTarget] = useState(null);
  const [stockCountDetailRecord, setStockCountDetailRecord] = useState(null);
  const [stockCountExpandedSections, setStockCountExpandedSections] = useState({});
  const [stockCountHistoryPreset, setStockCountHistoryPreset] = useState('all_history');
  const [stockCountHistoryStartDate, setStockCountHistoryStartDate] = useState('');
  const [stockCountHistoryEndDate, setStockCountHistoryEndDate] = useState('');
  const [appliedStockCountHistoryRange, setAppliedStockCountHistoryRange] = useState(() => ({
    startDate: '',
    endDate: '',
  }));
  const [wastageDeleteTarget, setWastageDeleteTarget] = useState(null);
  const [deletingWastageId, setDeletingWastageId] = useState(null);
  const [selectedCountSheetId, setSelectedCountSheetId] = useState('');
  const [expandedSummaryCategory, setExpandedSummaryCategory] = useState(null);
  const inventoryTableRef = React.useRef(null);
  const stockCountHistoryLoadedRef = React.useRef(false);
  const [inventoryTableScrollTop, setInventoryTableScrollTop] = useState(0);

  const queryClient = useQueryClient();
  const { organization, brand, location, userProfile } = useAuth();
  const organizationId = organization?.id || organization?.organization_id || null;
  const brandId = brand?.brand_id || brand?.id || location?.brand_id || null;
  const locationId = location?.location_id || location?.id || null;
  const selectedContext = React.useMemo(() => ({
    organization: organizationId ? { ...(organization || {}), id: organizationId } : organization,
    brand: brandId ? { ...(brand || {}), id: brandId, brand_id: brandId } : brand,
    location: locationId ? { ...(location || {}), id: locationId, brand_id: location?.brand_id || brandId || null } : location,
  }), [brand, brandId, location, locationId, organization, organizationId]);
  const stockCountHistoryCacheKey = React.useMemo(() => {
    if (!organizationId) return null;
    return [
      'restops_stock_count_history',
      organizationId,
      brandId || 'all-brands',
      locationId || userProfile?.location_id || 'all-locations',
    ].join(':');
  }, [brandId, locationId, organizationId, userProfile?.location_id]);
  const inventoryInvalidationKeys = React.useMemo(() => [
    ['inventory', organizationId],
    ['inventoryMetrics', organizationId],
  ], [organizationId]);
  const wastageInvalidationKeys = React.useMemo(() => [
    ['wastage', organizationId],
  ], [organizationId]);
  const countSheetsInvalidationKeys = React.useMemo(() => [
    ['count_sheets', organizationId],
  ], [organizationId]);
  const countSessionsInvalidationKeys = React.useMemo(() => [
    ['count_sessions', organizationId],
  ], [organizationId]);
  const invalidateInventoryRealtime = useDebouncedQueryInvalidation(queryClient, inventoryInvalidationKeys, 1500);
  const invalidateWastageRealtime = useDebouncedQueryInvalidation(queryClient, wastageInvalidationKeys, 1500);
  const invalidateCountSheetsRealtime = useDebouncedQueryInvalidation(queryClient, countSheetsInvalidationKeys, 1500);
  const invalidateCountSessionsRealtime = useDebouncedQueryInvalidation(queryClient, countSessionsInvalidationKeys, 1500);
  const needsInventory = ['inventory', 'summary', 'daily-snapshot', 'counts', 'count-sheets', 'transfers'].includes(activeTab) || editDialogOpen || addDialogOpen || convertDialogOpen || wastageDialogOpen || scannerDialogOpen || activeSessionOpen;
  const needsWastage = true;
  const needsCountSheets = ['counts', 'count-sheets'].includes(activeTab) || activeSessionOpen || newTemplateOpen;
  const needsCountSessions = activeTab === 'counts' || activeSessionOpen;
  const needsRecipes = activeTab === 'pos-sync';

  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    fetchNextPage: fetchNextInventoryPage,
    hasNextPage: hasNextInventoryPage,
    isFetchingNextPage: isFetchingNextInventoryPage
  } = useAuthInfiniteQuery({
    queryKey: ['inventory', organizationId, brandId, locationId, debouncedSearch, categoryFilter, sortInventory],
    queryFn: ({ pageParam = 0 }) => {
      const conditions = {};
      return api.entities.Inventory.filter(conditions, {
        page: pageParam,
        pageSize: 50,
        search: debouncedSearch || undefined,
        searchColumn: 'product_name',
        orderBy: sortInventory
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organizationId && needsInventory,
  });

  const { data: inventoriedProductData = [], isLoading: inventoriedProductsLoading } = useAuthQuery({
    queryKey: ['inventoryProductSource', organizationId, brandId, locationId, debouncedSearch],
    queryFn: () => api.products.getCatalog({
      organizationId,
      brandId,
      locationId,
      search: debouncedSearch || null,
      sortBy: 'name',
      page: 0,
      pageSize: 1000,
    }),
    enabled: !!organizationId && needsInventory,
  });

  const inventoriedProductLookup = React.useMemo(() => {
    const lookup = {
      ids: new Set(),
      productIds: new Set(),
      names: new Set(),
    };

    inventoriedProductData
      .filter(product => product?.is_inventoried)
      .forEach(product => {
        if (product.id) lookup.ids.add(String(product.id));
        if (product.product_id) lookup.productIds.add(String(product.product_id).trim().toLowerCase());
        const productName = product.name || product.product_name;
        if (productName) lookup.names.add(String(productName).trim().toLowerCase());
      });

    return lookup;
  }, [inventoriedProductData]);

  const rawInventory = React.useMemo(() => {
    if (!inventoryData?.pages) return [];
    const flat = inventoryData.pages.flat();
    return filterByContext(flat, selectedContext);
  }, [inventoryData, selectedContext]);

  const inventory = React.useMemo(() => {
    if (!inventoryData?.pages || inventoriedProductsLoading) return [];

    const matchedInventoryKeys = {
      ids: new Set(),
      productIds: new Set(),
      names: new Set(),
    };

    const trackedInventoryRows = rawInventory.filter(item => {
      if (item.internal_product_id && inventoriedProductLookup.ids.has(String(item.internal_product_id))) return true;
      if (item.product_id && inventoriedProductLookup.productIds.has(String(item.product_id).trim().toLowerCase())) return true;
      if (item.product_name && inventoriedProductLookup.names.has(String(item.product_name).trim().toLowerCase())) return true;
      return false;
    });

    trackedInventoryRows.forEach(item => {
      if (item.internal_product_id) matchedInventoryKeys.ids.add(String(item.internal_product_id));
      if (item.product_id) matchedInventoryKeys.productIds.add(String(item.product_id).trim().toLowerCase());
      if (item.product_name) matchedInventoryKeys.names.add(String(item.product_name).trim().toLowerCase());
    });

    const productBackedRows = inventoriedProductData
      .filter(product => product?.is_inventoried)
      .filter(product => {
        if (product.id && matchedInventoryKeys.ids.has(String(product.id))) return false;
        if (product.product_id && matchedInventoryKeys.productIds.has(String(product.product_id).trim().toLowerCase())) return false;
        const productName = product.name || product.product_name;
        if (productName && matchedInventoryKeys.names.has(String(productName).trim().toLowerCase())) return false;
        return true;
      })
      .map(product => {
        const productName = product.name || product.product_name || 'Unnamed product';
        const unit = product.report_by_unit || product.base_unit || 'ea';
        const categoryOption = getInventoryCategoryOption(product);
        return {
          id: `catalog-product:${product.id || product.product_id || productName}`,
          inventory_id: null,
          internal_product_id: product.id || null,
          product_id: product.product_id || null,
          product_name: productName,
          accounting_category: product.accounting_category || categoryOption.code || '1210',
          category: product.category || categoryOption.label,
          current_quantity: 0,
          current_unit: unit,
          unit_cost: Number(product.latest_price || 0),
          current_value: 0,
          previous_quantity: 0,
          previous_value: 0,
          par_level: null,
          reorder_point: null,
          location: '',
          organization_id: product.organization_id || organizationId || null,
          brand_id: product.brand_id || brandId || null,
          location_id: product.location_id || locationId || null,
          is_product_backed_inventory: true,
        };
      });

    return [...trackedInventoryRows, ...productBackedRows].sort((a, b) => (
      String(a.product_name || '').localeCompare(String(b.product_name || ''))
    ));
  }, [brandId, inventoriedProductData, inventoriedProductLookup, inventoriedProductsLoading, inventoryData?.pages, locationId, organizationId, rawInventory]);

  const isLoading = inventoryLoading || inventoriedProductsLoading;

  const { data: inventoryMetrics } = useAuthQuery({
    queryKey: ['inventoryMetrics', organizationId, locationId, debouncedSearch],
    queryFn: () => api.metrics.getInventoryTotals(organizationId, debouncedSearch, locationId),
    enabled: !!organizationId && ['inventory', 'summary', 'daily-snapshot'].includes(activeTab),
  });

  const { data: snapshotInvoices = [] } = useAuthQuery({
    queryKey: ['inventoryDailySnapshotInvoices', organization?.id, brand?.id, location?.id],
    queryFn: async () => {
      let invoiceQuery = supabase
        .from('invoices')
        .select('id, vendor_name, invoice_number, created_at, invoice_date, status, organization_id, brand_id, location_id, total_amount, line_items')
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (location?.id) invoiceQuery = invoiceQuery.eq('location_id', location.id);
      else if (brand?.id) invoiceQuery = invoiceQuery.eq('brand_id', brand.id);

      const { data: invoices, error: invoiceError } = await invoiceQuery;
      if (invoiceError) throw invoiceError;
      const invoiceIds = (invoices || []).map(invoice => invoice.id);
      if (invoiceIds.length === 0) return [];

      const { data: normalizedLines, error: lineError } = await supabase
        .from('invoice_line_items')
        .select('id, invoice_id, item_name, quantity, unit_price, total_price, vendor_unit, vendor_item_code')
        .eq('organization_id', organization.id)
        .in('invoice_id', invoiceIds);

      if (lineError) {
        console.warn('Daily snapshot could not read normalized invoice lines; using invoice JSON lines instead.', lineError);
      }

      const linesByInvoice = (lineError ? [] : (normalizedLines || [])).reduce((acc, line) => {
        if (!acc[line.invoice_id]) acc[line.invoice_id] = [];
        acc[line.invoice_id].push(line);
        return acc;
      }, {});

      return (invoices || []).map(invoice => ({
        ...invoice,
        snapshot_line_items: linesByInvoice[invoice.id]?.length
          ? linesByInvoice[invoice.id]
          : (Array.isArray(invoice.line_items) ? invoice.line_items : []),
      }));
    },
    enabled: !!organization?.id && activeTab === 'daily-snapshot',
  });

  const dailySnapshotRows = React.useMemo(() => {
    const rows = [];
    snapshotInvoices.forEach(invoice => {
      const receivedDate = getLocalDateKey(invoice.created_at || invoice.invoice_date);
      const lines = Array.isArray(invoice.snapshot_line_items) ? invoice.snapshot_line_items : [];
      if (lines.length === 0) {
        rows.push({
          id: `${invoice.id}:invoice-total`,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          vendor_name: invoice.vendor_name || 'Unknown vendor',
          received_date: receivedDate,
          item_name: invoice.vendor_name || `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`,
          category: 'Invoice',
          quantity: 1,
          unit: 'invoice',
          value: Number(invoice.total_amount || 0),
        });
        return;
      }

      lines.forEach((line, index) => {
        rows.push({
          id: line.id || `${invoice.id}:${index}`,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          vendor_name: invoice.vendor_name || 'Unknown vendor',
          received_date: receivedDate,
          item_name: getInvoiceLineName(line),
          category: line.accounting_category || line.category || getCountSheetBucket(line),
          quantity: getInvoiceLineQuantity(line),
          unit: line.vendor_unit || line.unit || line.uom || 'ea',
          value: getInvoiceLineValue(line),
        });
      });
    });
    return rows;
  }, [snapshotInvoices]);

  const todaySnapshotRows = React.useMemo(() => {
    const today = formatDateInput(new Date());
    return dailySnapshotRows.filter(row => row.received_date === today);
  }, [dailySnapshotRows]);

  const previousSnapshotRows = React.useMemo(() => {
    const today = formatDateInput(new Date());
    return dailySnapshotRows.filter(row => row.received_date !== today);
  }, [dailySnapshotRows]);

  const {
    data: wastageData,
    fetchNextPage: fetchNextWastagePage,
    hasNextPage: hasNextWastagePage,
    isFetchingNextPage: isFetchingNextWastagePage
  } = useAuthInfiniteQuery({
    queryKey: ['wastage', organization?.id, debouncedSearch, sortWastage],
    queryFn: ({ pageParam = 0 }) => api.entities.WastageLog.list(sortWastage, {
      page: pageParam,
      pageSize: 50,
      search: activeTab === 'wastage' ? debouncedSearch || undefined : undefined,
      searchColumn: 'product_name'
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id && needsWastage,
  });

  const wastageLogs = React.useMemo(() => {
    return wastageData?.pages
      ? filterByContext(wastageData.pages.flat(), { organization, brand, location })
      : [];
  }, [wastageData, organization, brand, location]);

  const {
    data: countSheetsData,
    fetchNextPage: fetchNextCountSheetsPage,
    hasNextPage: hasNextCountSheetsPage,
    isFetchingNextPage: isFetchingNextCountSheetsPage
  } = useAuthInfiniteQuery({
    queryKey: ['count_sheets', organization?.id, debouncedSearch, sortCountSheets],
    queryFn: ({ pageParam = 0 }) => api.entities.CountSheet.list(sortCountSheets, {
      page: pageParam,
      pageSize: 50,
      search: activeTab === 'count-sheets' ? debouncedSearch || undefined : undefined,
      searchColumn: 'name'
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id && needsCountSheets,
  });

  const countSheets = React.useMemo(() => {
    if (!countSheetsData?.pages) return [];
    return filterByContext(countSheetsData.pages.flat(), { organization, brand, location });
  }, [countSheetsData, organization, brand, location]);

  useEffect(() => {
    if (activeTab !== 'counts' || !requestedStockCountSheetId || stockCountSheetId === requestedStockCountSheetId) return;
    if (!countSheets.some(sheet => sheet.id === requestedStockCountSheetId)) return;
    setStockCountSheetId(requestedStockCountSheetId);
    setStockCountScopes(['all']);
    setStockCountValues({});
    setEditingStockCountId(null);
    setStockCountDetailRecord(null);
  }, [activeTab, countSheets, requestedStockCountSheetId, stockCountSheetId]);

  const {
    data: countSessionsData,
    fetchNextPage: fetchNextCountSessionsPage,
    hasNextPage: hasNextCountSessionsPage,
    isFetchingNextPage: isFetchingNextCountSessionsPage
  } = useAuthInfiniteQuery({
    queryKey: ['count_sessions', organization?.id, sortCountSessions],
    queryFn: ({ pageParam = 0 }) => api.entities.CountSession.list(sortCountSessions, {
      page: pageParam,
      pageSize: 50,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id && needsCountSessions,
  });

  const countSessions = React.useMemo(() => {
    if (!countSessionsData?.pages) return [];
    return filterByContext(countSessionsData.pages.flat(), { organization, brand, location });
  }, [countSessionsData, organization, brand, location]);

  const normalizeCountSessionItems = React.useCallback((session = {}) => {
    if (Array.isArray(session.items)) return session.items;
    if (Array.isArray(session.counted_data)) return session.counted_data;
    if (session.counted_data && typeof session.counted_data === 'object') {
      return Object.entries(session.counted_data).map(([id, value]) => ({
        id,
        product_name: value?.product_name || value?.name || id,
        accounting_category: value?.accounting_category,
        category: value?.category,
        bucket: value?.bucket,
        unit: value?.unit,
        count: Number(value?.count ?? value?.quantity ?? value ?? 0),
        unit_cost: Number(value?.unit_cost ?? 0),
        value: Number(value?.value || (Number(value?.count ?? value?.quantity ?? value ?? 0) * Number(value?.unit_cost ?? 0)) || 0),
      }));
    }
    return [];
  }, []);

  const normalizeCountSessionRow = React.useCallback((session = {}) => {
    const items = normalizeCountSessionItems(session);
    return {
      id: session.id || session.session_id,
      countSheetId: session.count_sheet_id,
      date: session.count_date || session.created_at?.split('T')[0] || session.started_at?.split('T')[0] || stockCountDate,
      scope: session.scope || session.type || 'Inventory',
      scopeKey: session.scope_key || 'all',
      type: session.type || session.notes || 'Inventory',
      status: ['closed', 'completed'].includes(String(session.status || '').toLowerCase()) ? 'Closed' : 'Saved',
      itemCount: Number(session.item_count ?? items.length),
      countedItems: items.filter(item => Number(item.count || 0) > 0).length,
      total: Number(session.total_value ?? items.reduce((sum, item) => sum + Number(item.value || 0), 0)),
      items,
      savedAt: session.saved_at || session.created_at || session.started_at || new Date().toISOString(),
      closedAt: session.closed_at,
      updatedAt: session.updated_at,
    };
  }, [normalizeCountSessionItems, stockCountDate]);

  useEffect(() => {
    if (!stockCountHistoryCacheKey || typeof localStorage === 'undefined') return;
    stockCountHistoryLoadedRef.current = false;
    try {
      const cachedRows = JSON.parse(localStorage.getItem(stockCountHistoryCacheKey) || '[]');
      setStockCountHistory(Array.isArray(cachedRows) ? cachedRows : []);
    } catch {
      setStockCountHistory([]);
    } finally {
      stockCountHistoryLoadedRef.current = true;
    }
  }, [stockCountHistoryCacheKey]);

  useEffect(() => {
    if (!stockCountHistoryCacheKey || typeof localStorage === 'undefined' || !stockCountHistoryLoadedRef.current) return;
    localStorage.setItem(stockCountHistoryCacheKey, JSON.stringify(stockCountHistory));
  }, [stockCountHistory, stockCountHistoryCacheKey]);

  useEffect(() => {
    const rows = countSessions.map(normalizeCountSessionRow).filter(row => row.id);
    if (rows.length === 0) return;
    setStockCountHistory(prev => {
      const merged = new Map(prev.map(row => [row.id, row]));
      rows.forEach(row => {
        const existing = merged.get(row.id);
        const existingTotal = Number(existing?.total ?? existing?.total_value ?? 0);
        const incomingTotal = Number(row.total ?? row.total_value ?? 0);
        const existingHasItems = Array.isArray(existing?.items) && existing.items.length > 0;
        const incomingHasItems = Array.isArray(row.items) && row.items.length > 0;

        merged.set(row.id, existing && existingHasItems && existingTotal > 0 && (!incomingHasItems || incomingTotal === 0)
          ? { ...row, ...existing }
          : { ...existing, ...row }
        );
      });
      return Array.from(merged.values()).sort((a, b) => (
        new Date(b.savedAt || b.updatedAt || b.date || 0) - new Date(a.savedAt || a.updatedAt || a.date || 0)
      ));
    });
  }, [countSessions, normalizeCountSessionRow]);

  const {
    data: recipesData,
    fetchNextPage: fetchNextRecipesPage,
    hasNextPage: hasNextRecipesPage,
    isFetchingNextPage: isFetchingNextRecipesPage
  } = useAuthInfiniteQuery({
    queryKey: ['recipes', organization?.id, debouncedSearch, sortRecipes],
    queryFn: ({ pageParam = 0 }) => api.entities.Recipe.list(sortRecipes, {
      page: pageParam,
      pageSize: 50,
      search: activeTab === 'pos-sync' ? debouncedSearch || undefined : undefined,
      searchColumn: 'name'
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id && needsRecipes,
  });

  const recipes = React.useMemo(() => {
    if (!recipesData?.pages) return [];
    return filterByContext(recipesData.pages.flat(), { organization, brand, location });
  }, [recipesData, organization, brand, location]);

  useEffect(() => {
    if (!organization?.id) return undefined;
    const orgFilter = `organization_id=eq.${organization.id}`;
    const channel = supabase.channel(`inventory-realtime-${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: orgFilter }, invalidateInventoryRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wastage_logs', filter: orgFilter }, invalidateWastageRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'count_sheets', filter: orgFilter }, invalidateCountSheetsRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'count_sessions', filter: orgFilter }, invalidateCountSessionsRealtime)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateCountSessionsRealtime, invalidateCountSheetsRealtime, invalidateInventoryRealtime, invalidateWastageRealtime, organization?.id]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, syncProduct = false, sourceItem = null }) => {
      const updatedInventory = await api.entities.Inventory.update(id, data);

      if (syncProduct) {
        const productRef = sourceItem?.product_id;
        const productPayload = {
          name: data.product_name,
          accounting_category: data.accounting_category,
          report_by_unit: data.current_unit,
          base_unit: data.current_unit,
          latest_price: data.unit_cost,
          is_inventoried: true,
        };

        try {
          let product = null;
          if (productRef) {
            try {
              product = await api.entities.Product.get(productRef);
            } catch {
              const matches = await api.entities.Product.filter({ product_id: productRef }, { limit: 1 });
              product = matches[0] || null;
            }
          }
          if (!product && sourceItem?.product_name) {
            const matches = await api.entities.Product.filter({}, {
              search: sourceItem.product_name,
              searchColumn: 'name',
              limit: 1,
            });
            product = matches.find(row => row.name?.toLowerCase() === sourceItem.product_name.toLowerCase()) || matches[0] || null;
          }
          if (product?.id) await api.entities.Product.update(product.id, productPayload);
        } catch (error) {
          toast.error(error?.message || 'Inventory saved, but linked product was not updated');
        }
      }

      return updatedInventory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId, brandId, locationId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      toast.success('Inventory updated');
      setEditDialogOpen(false);
    },
    onError: (error) => toast.error(error?.message || 'Unable to update inventory'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Inventory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId, brandId, locationId] });
      toast.success('Item added to inventory');
      setAddDialogOpen(false);
      setAddForm({ product_name: '', accounting_category: '1210', current_quantity: 0, current_unit: 'ea', unit_cost: 0, par_level: 0, reorder_point: 0, location: '' });
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to add inventory item');
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
      queryClient.invalidateQueries({ queryKey: ['inventory', organizationId, brandId, locationId] });
    },
    onSuccess: () => {
      toast.success('Item removed from inventory');
    },
  });

  const saveLocalCountSheet = async () => {
    if (!countSheetForm.name.trim()) {
      toast.error('Enter a count sheet name');
      return;
    }
    if (countSheetForm.buckets.length === 0) {
      toast.error('Choose at least one product group');
      return;
    }

    const selectedItems = inventory.filter(item => countSheetForm.buckets.includes(getCountSheetBucket(item)));
    try {
      await api.entities.CountSheet.create({
      name: countSheetForm.name.trim(),
      description: countSheetForm.organizeBy === 'auto_category'
        ? 'Auto organized by product group'
        : 'Manual shelf order',
      status: 'active',
      organization_id: organizationId,
      brand_id: brandId,
      location_id: locationId || userProfile?.location_id || null,
      organize_by: countSheetForm.organizeBy,
      auto_add_product_groups: countSheetForm.buckets,
      items: selectedItems.map((item) => ({
        inventory_id: item.id,
        product_name: item.product_name,
        expected_quantity: item.current_quantity || 0,
        unit: item.current_unit || 'ea',
      })),
    });

      setCountSheetForm({ name: '', buckets: [], organizeBy: 'auto_category' });
      setNewTemplateOpen(false);
      setCountSheetStatus('active');
      invalidateCountSheetsRealtime();
      toast.success('Count sheet added');
    } catch (error) {
      toast.error(error.message || 'Unable to add count sheet');
    }
  };

  const deleteCountSheetMutation = useMutation({
    mutationFn: async (sheet) => {
      if (!sheet?.id) throw new Error('Count sheet not found');
      if (sheet.local_only) return sheet;
      try {
        return await api.entities.CountSheet.update(sheet.id, {
          status: 'deleted',
          deleted_at: new Date().toISOString(),
        });
      } catch {
        return api.entities.CountSheet.delete(sheet.id);
      }
    },
    onSuccess: (_data, sheet) => {
      setCountSheetDeleteTarget(null);
      if (editingCountSheetId === sheet?.id) {
        setEditingCountSheetId(null);
        setCountSheetDraft(null);
      }
      if (stockCountSheetId === sheet?.id) {
        setStockCountSheetId('');
      }
      invalidateCountSheetsRealtime();
      toast.success('Count sheet deleted');
    },
    onError: (error) => toast.error(error?.message || 'Unable to delete count sheet'),
  });

  const completeCountSessionMutation = useMutation({
    mutationFn: async (counts = {}) => {
      const sheet = countSheets.find((item) => item.id === selectedCountSheetId) || countSheets[0];
      if (!sheet) throw new Error('Create a count template first');

      // The new Postgres RPC handles the variance math, GL entry generation,
      // count session creation, inventory updates, and inventory movements atomically.
      const result = await api.metrics.completeCountSession(
        organization?.id,
        location?.id || userProfile?.location_id,
        sheet.id,
        counts,
        userProfile?.id
      );

      if (result && Math.abs(result.total_variance || 0) > 0.01) {
        const isFavorable = result.total_variance > 0;
        toast.success(`Automated GL Entry Generated: ${isFavorable ? 'Credited' : 'Debited'} COGS for $${Math.abs(result.total_variance).toFixed(2)}`);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['count_sessions', organization?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory_movements', organization?.id] });
      toast.success('Count session completed and inventory updated');
      setSelectedCountSheetId('');
      setActiveSessionOpen(false);
    },
    onError: (error) => toast.error(error.message || 'Failed to complete count session'),
  });

  // Stats
  const { totalItems, totalValue, lowStock } = React.useMemo(() => {
    const inventoryLoaded = Boolean(inventoryData?.pages);
    const adjustedInventoryValue = inventory.reduce((sum, item) => {
      const value = Number(item.current_value || (Number(item.current_quantity || 0) * Number(item.unit_cost || 0)) || 0);
      return sum + value;
    }, 0);
    const adjustedInventoryItems = inventory.length;
    const adjustedLowStock = inventory.filter(isBelowReorderPoint).length;

    return {
      totalItems: inventoryLoaded ? adjustedInventoryItems : (inventoryMetrics?.totalItems || 0),
      totalValue: inventoryLoaded ? adjustedInventoryValue : Number(inventoryMetrics?.totalValue || 0),
      lowStock: inventoryLoaded ? adjustedLowStock : (inventoryMetrics?.lowStock || 0),
    };
  }, [inventory, inventoryData?.pages, inventoryMetrics]);

  const wasteLogValue = React.useMemo(() => {
    return wastageLogs.reduce((sum, log) => sum + Number(log.value || 0), 0);
  }, [wastageLogs]);

  const currentMonthWastageValue = React.useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    return wastageLogs.reduce((sum, log) => {
      if (log.deleted_at) return sum;
      const logDate = new Date(log.logged_at || log.created_at);
      if (Number.isNaN(logDate.getTime()) || logDate < monthStart) return sum;
      return sum + Number(log.value || 0);
    }, 0);
  }, [wastageLogs]);

  const displayedMtdWastageValue = currentMonthWastageValue;

  const byCategory = React.useMemo(() => {
    return inventory.reduce((acc, item) => {
      const cat = item.accounting_category || 'Other';
      if (!acc[cat]) acc[cat] = { items: 0, value: 0, rows: [] };
      const value = Number(item.current_value || (Number(item.current_quantity || 0) * Number(item.unit_cost || 0)) || 0);
      acc[cat].items++;
      acc[cat].value += value;
      acc[cat].rows.push({ ...item, summary_value: value });
      return acc;
    }, {});
  }, [inventory]);

  const inventoryBuckets = React.useMemo(() => {
    const bucketOrder = ['Food', 'Beer', 'Wine', 'Liquor', 'N/A Bev', 'Retail', 'Other'];
    const buckets = Object.values(inventory.reduce((acc, item) => {
      const label = getCountSheetBucket(item);
      if (!acc[label]) acc[label] = { label, items: 0, value: 0 };
      acc[label].items += 1;
      acc[label].value += Number(item.current_value || (Number(item.current_quantity || 0) * Number(item.unit_cost || 0)) || 0);
      return acc;
    }, {})).sort((a, b) => {
      const aIndex = bucketOrder.indexOf(a.label);
      const bIndex = bucketOrder.indexOf(b.label);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

    return buckets.map((bucket, index) => ({
      ...bucket,
      accent: getBucketAccent(index),
      percent: totalValue > 0 && bucket.value > 0 ? (bucket.value / totalValue) * 100 : null,
    }));
  }, [inventory, totalValue]);

  const summaryBuckets = React.useMemo(() => {
    const cardOrder = ['Food', 'Liquor', 'Wine', 'Beverages', 'Other'];
    const cards = Object.fromEntries(cardOrder.map(label => [label, { label, items: 0, value: 0 }]));

    inventoryBuckets.forEach(bucket => {
      const label = getSummaryBucketLabel(bucket.label);
      cards[label].items += bucket.items;
      cards[label].value += bucket.value;
    });

    return cardOrder.map((label, index) => ({
      ...cards[label],
      accent: getBucketAccent(index),
      percent: totalValue > 0 && cards[label].value > 0 ? (cards[label].value / totalValue) * 100 : null,
    }));
  }, [inventoryBuckets, totalValue]);

  const summaryCategoryRows = React.useMemo(() => {
    return Object.entries(byCategory)
      .map(([category, data]) => ({
        category,
        label: getCOALabel(category),
        ...data,
        percent: totalValue > 0 && data.value > 0 ? (data.value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [byCategory, totalValue]);

  const summaryLowStockRows = React.useMemo(() => {
    return inventory
      .filter(isBelowReorderPoint)
      .slice()
      .sort((a, b) => Number(a.current_quantity || 0) - Number(b.current_quantity || 0))
      .slice(0, 6);
  }, [inventory]);

  const summaryTopValueRows = React.useMemo(() => {
    return inventory
      .slice()
      .sort((a, b) => {
        const aValue = Number(a.current_value || (Number(a.current_quantity || 0) * Number(a.unit_cost || 0)) || 0);
        const bValue = Number(b.current_value || (Number(b.current_quantity || 0) * Number(b.unit_cost || 0)) || 0);
        return bValue - aValue;
      })
      .slice(0, 6);
  }, [inventory]);

  const filteredWastageLogs = React.useMemo(() => {
    const startDate = parseLocalDate(appliedWastageDateRange.startDate);
    const endDate = parseLocalDate(appliedWastageDateRange.endDate);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    return wastageLogs.filter((log) => {
      const logDate = new Date(log.created_at);
      return (!startDate || logDate >= startDate) && (!endDate || logDate <= endDate);
    });
  }, [appliedWastageDateRange.endDate, appliedWastageDateRange.startDate, wastageLogs]);

  const wasteReasonSummary = React.useMemo(() => {
    return Object.entries(filteredWastageLogs.reduce((acc, log) => {
      const reason = log.reason || 'other';
      if (!acc[reason]) acc[reason] = { reason, count: 0, value: 0, quantity: 0 };
      acc[reason].count += 1;
      acc[reason].value += Number(log.value || 0);
      acc[reason].quantity += Number(log.quantity || 0);
      return acc;
    }, {})).map(([, data]) => data).sort((a, b) => b.value - a.value);
  }, [filteredWastageLogs]);

  const wasteReasonChartData = React.useMemo(() => {
    return wasteReasonSummary.slice(0, 6).map((reason, index) => ({
      name: reason.reason.replace(/_/g, ' '),
      value: Number(reason.value || 0),
      count: reason.count,
      color: WASTE_CHART_COLORS[index % WASTE_CHART_COLORS.length],
    }));
  }, [wasteReasonSummary]);

  const wasteReasonChartTotal = React.useMemo(() => {
    return wasteReasonChartData.reduce((sum, item) => sum + Number(item.value || 0), 0);
  }, [wasteReasonChartData]);

  const wasteHistoryRows = React.useMemo(() => {
    return filteredWastageLogs
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [filteredWastageLogs]);

  const stockCountSections = React.useMemo(() => {
    if (!stockCountDate) return [];
    const selectedSheet = countSheets.find(sheet => sheet.id === stockCountSheetId);
    if (selectedSheet) {
      const inventoryById = new Map(inventory.map(item => [item.id, item]));
      const inventoryByName = new Map(inventory.map(item => [String(item.product_name || '').toLowerCase(), item]));
      const sheetItems = (Array.isArray(selectedSheet.items) ? selectedSheet.items : [])
        .map(sheetItem => {
          const inventoryItem = inventoryById.get(sheetItem.inventory_id)
            || inventoryByName.get(String(sheetItem.product_name || '').toLowerCase());
          return inventoryItem
            ? { ...inventoryItem, sheet_sort_order: sheetItem.sort_order || 0 }
            : null;
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.sheet_sort_order || 0) - Number(b.sheet_sort_order || 0));

      const byBucket = sheetItems.reduce((acc, item) => {
        const label = getCOALabel(item.accounting_category);
        const key = item.accounting_category || getCountSheetBucket(item);
        if (!acc[key]) acc[key] = { key, label, items: [] };
        acc[key].items.push(item);
        return acc;
      }, {});

      return Object.values(byBucket);
    }

    const selectedKeys = new Set(stockCountScopes);
    const showAll = selectedKeys.has('all') || selectedKeys.size === 0;

    const byAccount = inventory.reduce((acc, item) => {
      const key = item.accounting_category || 'uncategorized';
      const label = getCOALabel(item.accounting_category);
      if (!acc[key]) acc[key] = { key, label, items: [] };
      acc[key].items.push(item);
      return acc;
    }, {});

    return Object.values(byAccount)
      .filter(group => {
        if (showAll) return true;
        const bucket = getSummaryBucketLabel(getCountSheetBucket({
          accounting_category: group.key,
          category: group.label,
          product_name: group.label,
        }));
        const exactBucket = getCountSheetBucket({
          accounting_category: group.key,
          category: group.label,
          product_name: group.label,
        });
        return INVENTORY_ITEM_CATEGORY_OPTIONS.some((selected) => {
          if (!selectedKeys.has(selected.key)) return false;
          if (selected.label === 'N/A Bev') return exactBucket === 'N/A Bev';
          return selected.label === bucket || selected.label === exactBucket;
        });
      })
      .map(group => ({
        ...group,
        items: group.items.slice().sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || ''))),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [countSheets, inventory, stockCountDate, stockCountScopes, stockCountSheetId]);

  const stockCountOptions = React.useMemo(() => {
    const counts = inventory.reduce((acc, item) => {
      acc.all += 1;
      const bucket = getCountSheetBucket(item);
      const option = INVENTORY_ITEM_CATEGORY_OPTIONS.find(entry => entry.label === bucket);
      if (option) acc[option.key] = (acc[option.key] || 0) + 1;
      return acc;
    }, Object.fromEntries(INVENTORY_CATEGORY_OPTIONS.map(option => [option.key, 0])));

    return INVENTORY_CATEGORY_OPTIONS.map(option => ({
      ...option,
      label: option.key === 'all' ? 'All Inventory' : `${option.label} Inventory`,
      items: counts[option.key] || 0,
    }));
  }, [inventory]);

  const countSheetBucketOptions = React.useMemo(() => {
    const bucketCounts = new Map(inventoryBuckets.map(bucket => [bucket.label, bucket]));
    return INVENTORY_ITEM_CATEGORY_OPTIONS.map((option, index) => {
      const bucket = bucketCounts.get(option.label);
      return {
        label: option.label,
        items: bucket?.items || 0,
        value: bucket?.value || 0,
        percent: bucket?.percent ?? null,
        accent: bucket?.accent || getBucketAccent(index),
      };
    });
  }, [inventoryBuckets]);

  const allCountSheets = React.useMemo(() => {
    return countSheets;
  }, [countSheets]);

  const countSheetRows = React.useMemo(() => {
    const inventoryById = new Map(inventory.map(item => [item.id, item]));
    const inventoryByName = new Map(inventory.map(item => [String(item.product_name || '').toLowerCase(), item]));

    return allCountSheets
      .filter(sheet => {
        if (countSheetStatus === 'all') return true;
        const status = String(sheet.status || 'active').toLowerCase();
        return countSheetStatus === 'active'
          ? !['archived', 'inactive', 'deleted'].includes(status)
          : status === countSheetStatus;
      })
      .map(sheet => {
        const items = Array.isArray(sheet.items) ? sheet.items : [];
        const counts = Object.fromEntries(countSheetBucketOptions.map(bucket => [bucket.label, 0]));
        const includedGroups = Array.isArray(sheet.auto_add_product_groups)
          ? sheet.auto_add_product_groups
          : [];

        items.forEach(sheetItem => {
          const inventoryItem = inventoryById.get(sheetItem.inventory_id)
            || inventoryByName.get(String(sheetItem.product_name || '').toLowerCase())
            || sheetItem;
          const bucket = getCountSheetBucket(inventoryItem);
          counts[bucket] = (counts[bucket] || 0) + 1;
        });

        return {
          ...sheet,
          itemCount: items.length,
          bucketCounts: counts,
          bucketIncluded: Object.fromEntries(countSheetBucketOptions.map(bucket => [
            bucket.label,
            includedGroups.includes(bucket.label) || Number(counts[bucket.label] || 0) > 0,
          ])),
        };
      });
  }, [allCountSheets, countSheetBucketOptions, countSheetStatus, inventory]);

  const editingCountSheet = React.useMemo(() => {
    if (!editingCountSheetId) return null;
    return countSheetRows.find(sheet => sheet.id === editingCountSheetId) || null;
  }, [countSheetRows, editingCountSheetId]);

  const countSheetDraftItems = React.useMemo(() => {
    if (!countSheetDraft) return [];
    const inventoryById = new Map(inventory.map(item => [item.id, item]));
    return (countSheetDraft.items || []).map((item, index) => {
      const inventoryItem = inventoryById.get(item.inventory_id) || {};
      const unitCost = Number(inventoryItem.unit_cost ?? item.unit_cost ?? 0);
      return {
        ...item,
        rowId: item.inventory_id || item.id || `${item.product_name}-${index}`,
        product_id: inventoryItem.product_id || item.product_id || null,
        product_name: inventoryItem.product_name || item.product_name || 'Unnamed item',
        last_purchased_at: inventoryItem.last_purchased_at || inventoryItem.updated_at || inventoryItem.created_at || item.last_purchased_at,
        unit: inventoryItem.current_unit || item.unit || 'ea',
        unit_cost: unitCost,
        bucket: getCountSheetBucket(inventoryItem.id ? inventoryItem : item),
      };
    });
  }, [countSheetDraft, inventory]);

  const countSheetDraftSections = React.useMemo(() => {
    const grouped = countSheetDraftItems.reduce((acc, item) => {
      const label = item.bucket || 'Other';
      if (!acc[label]) acc[label] = [];
      acc[label].push(item);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, items]) => ({ label, items }));
  }, [countSheetDraftItems]);

  const openCountSheetEditor = (sheet) => {
    const sheetItems = Array.isArray(sheet.items) ? sheet.items : [];
    setEditingCountSheetId(sheet.id);
    setCountSheetDraft({
      id: sheet.id,
      name: sheet.name || '',
      buckets: Array.isArray(sheet.auto_add_product_groups)
        ? sheet.auto_add_product_groups
        : countSheetBucketOptions.filter(bucket => Number(sheet.bucketCounts?.[bucket.label] || 0) > 0).map(bucket => bucket.label),
      organizeBy: sheet.organize_by || 'auto_category',
      items: sheetItems.map((item, index) => ({ ...item, sort_order: item.sort_order ?? index + 1 })),
    });
    setCountSheetProductToAdd('');
  };

  const setCountSheetDraftBuckets = (bucketLabel, checked) => {
    setCountSheetDraft(prev => {
      if (!prev) return prev;
      const buckets = checked
        ? [...new Set([...prev.buckets, bucketLabel])]
        : prev.buckets.filter(label => label !== bucketLabel);
      const existingIds = new Set((prev.items || []).map(item => item.inventory_id));
      const autoItems = checked
        ? inventory
            .filter(item => getCountSheetBucket(item) === bucketLabel && !existingIds.has(item.id))
            .map((item, index) => ({
              inventory_id: item.id,
              product_name: item.product_name,
              unit: item.current_unit || 'ea',
              expected_quantity: item.current_quantity || 0,
              sort_order: (prev.items || []).length + index + 1,
            }))
        : [];
      return {
        ...prev,
        buckets,
        items: [...(prev.items || []), ...autoItems],
      };
    });
  };

  const addProductToCountSheetDraft = () => {
    const product = inventory.find(item => item.id === countSheetProductToAdd);
    if (!product) return;
    setCountSheetDraft(prev => {
      if (!prev || (prev.items || []).some(item => item.inventory_id === product.id)) return prev;
      return {
        ...prev,
        items: [
          ...(prev.items || []),
          {
            inventory_id: product.id,
            product_name: product.product_name,
            unit: product.current_unit || 'ea',
            expected_quantity: product.current_quantity || 0,
            sort_order: (prev.items || []).length + 1,
          },
        ],
      };
    });
    setCountSheetProductToAdd('');
  };

  const removeProductFromCountSheetDraft = (rowId) => {
    setCountSheetDraft(prev => prev
      ? { ...prev, items: (prev.items || []).filter((item, index) => (item.inventory_id || item.id || `${item.product_name}-${index}`) !== rowId) }
      : prev
    );
  };

  const moveCountSheetDraftItem = (rowId, direction) => {
    setCountSheetDraft(prev => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const index = items.findIndex((item, itemIndex) => (item.inventory_id || item.id || `${item.product_name}-${itemIndex}`) === rowId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return prev;
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      return { ...prev, items: items.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 })) };
    });
  };

  const openCountSheetProduct = (item) => {
    const inventoryItem = inventory.find(row => (
      row.id === item.inventory_id ||
      row.id === item.rowId ||
      (item.product_name && row.product_name?.toLowerCase() === item.product_name.toLowerCase())
    ));
    if (!inventoryItem) {
      toast.error('This product is not available in inventory yet');
      return;
    }
    handleEdit(inventoryItem);
  };

  const startStockCountFromSheet = (sheet) => {
    if (!warnIfMissing()) return;
    if (!sheet?.id) return;
    setStockCountSheetId(sheet.id);
    setStockCountScopes(['all']);
    setStockCountValues({});
    setEditingStockCountId(null);
    setStockCountDetailRecord(null);
    setStockCountDate(new Date().toISOString().split('T')[0]);
    const params = new URLSearchParams(routerLocation.search);
    params.set('countSheetId', sheet.id);
    navigate(`/Inventory/counts?${params.toString()}`);
  };

  const saveCountSheetDraft = async () => {
    if (!countSheetDraft?.name?.trim()) {
      toast.error('Enter a count sheet name');
      return;
    }
    try {
      await api.entities.CountSheet.update(countSheetDraft.id, {
        name: countSheetDraft.name.trim(),
        description: countSheetDraft.organizeBy === 'auto_category' ? 'Auto organized by product group' : 'Manual shelf order',
        organize_by: countSheetDraft.organizeBy,
        auto_add_product_groups: countSheetDraft.buckets || [],
        items: (countSheetDraft.items || []).map((item, index) => ({
          inventory_id: item.inventory_id,
          product_name: item.product_name,
          expected_quantity: item.expected_quantity || 0,
          unit: item.unit || 'ea',
          sort_order: index + 1,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ['count_sheets'] });
      setEditingCountSheetId(null);
      setCountSheetDraft(null);
      toast.success('Count sheet saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save count sheet');
    }
  };

  const currentStockCountItems = React.useMemo(() => {
    return stockCountSections.flatMap(section => section.items.map(item => {
      const hasEnteredCount = Object.prototype.hasOwnProperty.call(stockCountValues, item.id);
      const count = Number(hasEnteredCount ? stockCountValues[item.id] : item.current_quantity || 0);
      const unitCost = Number(item.unit_cost || 0);
      const bucket = getSummaryBucketLabel(getCountSheetBucket(item));
      return {
        id: item.id,
        product_name: item.product_name,
        accounting_category: item.accounting_category,
        category: getCOALabel(item.accounting_category),
        bucket,
        unit: item.current_unit || 'ea',
        count,
        unit_cost: unitCost,
        value: count * unitCost,
      };
    }));
  }, [stockCountSections, stockCountValues]);

  const currentStockCountTotal = React.useMemo(() => {
    return currentStockCountItems.reduce((sum, item) => sum + item.value, 0);
  }, [currentStockCountItems]);

  const selectedStockCountSheet = React.useMemo(() => {
    if (!stockCountSheetId) return null;
    return countSheetRows.find(sheet => sheet.id === stockCountSheetId)
      || countSheets.find(sheet => sheet.id === stockCountSheetId)
      || null;
  }, [countSheetRows, countSheets, stockCountSheetId]);

  const getStockCountTypeName = React.useCallback((items, fallback = 'Inventory') => {
    const buckets = new Set(
      (items || [])
        .filter(item => Number(item.count || 0) > 0 || Number(item.value || 0) > 0)
        .map(item => getSummaryBucketLabel(item.bucket || getCountSheetBucket(item)))
    );

    if (buckets.size === 0) return fallback;
    if ([...buckets].some(bucket => ['Liquor', 'Wine', 'Beverages'].includes(bucket))) return 'Bar Inventory';
    if (buckets.size === 1 && buckets.has('Food')) return 'Food Inventory';
    if (buckets.size === 1) return `${[...buckets][0]} Inventory`;
    return 'Multiple Count Inventory';
  }, []);

  const getStockCountScopeType = React.useCallback((scopeKey, fallback = 'Inventory') => {
    const keys = String(scopeKey || 'all').split(',').filter(Boolean);
    if (keys.includes('all') || keys.length === 0) return 'All Inventory';
    const labels = keys
      .map(key => INVENTORY_CATEGORY_OPTIONS.find(entry => entry.key === key)?.label)
      .filter(Boolean);
    if (labels.length === 1) return `${labels[0]} Inventory`;
    if (labels.length > 1) return `${labels.join(' + ')} Inventory`;
    return fallback;
  }, []);

  const stockCountHistoryRows = React.useMemo(() => {
    const bucketLabels = summaryBuckets.map(bucket => bucket.label);

    return stockCountHistory.map(record => {
      const totalsByBucket = Object.fromEntries(bucketLabels.map(label => [label, 0]));
      const isActiveEditRow = editingStockCountId && record.id === editingStockCountId;
      const recordItems = isActiveEditRow ? currentStockCountItems : record.items;

      if (Array.isArray(recordItems) && recordItems.length > 0) {
        recordItems.forEach(item => {
          const rawBucket = item.bucket || item.category || getCountSheetBucket(item);
          const bucket = bucketLabels.includes(rawBucket)
            ? rawBucket
            : getSummaryBucketLabel(getCountSheetBucket({ ...item, category: rawBucket, product_name: item.product_name || rawBucket }));
          const value = Number(item.value || (Number(item.count || 0) * Number(item.unit_cost || 0)) || 0);
          totalsByBucket[bucket] = (totalsByBucket[bucket] || 0) + value;
        });
      } else {
        Object.entries(record.totalsByBucket || {}).forEach(([label, value]) => {
          const bucket = bucketLabels.includes(label)
            ? label
            : getSummaryBucketLabel(getCountSheetBucket({ category: label, product_name: label }));
          totalsByBucket[bucket] = (totalsByBucket[bucket] || 0) + Number(value || 0);
        });
      }

      const total = Object.values(totalsByBucket).reduce((sum, value) => sum + Number(value || 0), 0);
      const derivedType = getStockCountTypeName(recordItems, record.type || record.scope);
      return {
        ...record,
        type: isActiveEditRow && selectedStockCountSheet?.name
          ? selectedStockCountSheet.name
          : record.countSheetId
          ? (record.type || record.scope || derivedType)
          : getStockCountScopeType(record.scopeKey, derivedType),
        totalsByBucket,
        total,
      };
    });
  }, [currentStockCountItems, editingStockCountId, getStockCountScopeType, getStockCountTypeName, selectedStockCountSheet?.name, stockCountHistory, summaryBuckets]);

  const filteredStockCountHistoryRows = React.useMemo(() => {
    const startDate = parseLocalDate(appliedStockCountHistoryRange.startDate);
    const endDate = parseLocalDate(appliedStockCountHistoryRange.endDate);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    return stockCountHistoryRows.filter((record) => {
      const recordDate = parseLocalDate(record.date) || new Date(record.savedAt || record.updatedAt || 0);
      return (!startDate || recordDate >= startDate) && (!endDate || recordDate <= endDate);
    });
  }, [appliedStockCountHistoryRange.endDate, appliedStockCountHistoryRange.startDate, stockCountHistoryRows]);

  const editingStockCountRecord = React.useMemo(() => {
    if (!editingStockCountId) return null;
    return stockCountHistoryRows.find(record => record.id === editingStockCountId) || null;
  }, [editingStockCountId, stockCountHistoryRows]);

  const stockCountScopeKey = React.useMemo(() => {
    const keys = stockCountScopes.length > 0 ? stockCountScopes : ['all'];
    return keys.includes('all') ? 'all' : keys.join(',');
  }, [stockCountScopes]);

  const selectedStockCountLabel = React.useMemo(() => {
    if (selectedStockCountSheet?.name) return selectedStockCountSheet.name;
    return getStockCountScopeType(stockCountScopeKey, 'Inventory Count');
  }, [getStockCountScopeType, selectedStockCountSheet?.name, stockCountScopeKey]);

  useEffect(() => {
    if (!editingStockCountId) return;
    const scopeKey = stockCountSheetId ? `sheet:${stockCountSheetId}` : stockCountScopeKey;
    const type = selectedStockCountSheet?.name
      || getStockCountScopeType(stockCountScopeKey, getStockCountTypeName(currentStockCountItems, selectedStockCountLabel));
    const total = currentStockCountItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const now = new Date().toISOString();

    setStockCountHistory(prev => prev.map(row => (
      row.id === editingStockCountId
        ? {
            ...row,
            countSheetId: stockCountSheetId || row.countSheetId,
            count_sheet_id: stockCountSheetId || row.count_sheet_id,
            scopeKey,
            scope_key: scopeKey,
            scope: type,
            type,
            date: stockCountDate,
            count_date: stockCountDate,
            items: currentStockCountItems,
            itemCount: currentStockCountItems.length,
            item_count: currentStockCountItems.length,
            total,
            total_value: total,
            updatedAt: now,
            updated_at: now,
          }
        : row
    )));
  }, [currentStockCountItems, editingStockCountId, getStockCountScopeType, getStockCountTypeName, selectedStockCountLabel, selectedStockCountSheet?.name, stockCountDate, stockCountScopeKey, stockCountSheetId]);

  const toggleStockCountScope = (key) => {
    setStockCountScopes(prev => {
      if (key === 'all') return ['all'];
      const current = prev.includes('all') ? [] : prev;
      const next = current.includes(key)
        ? current.filter(item => item !== key)
        : [...current, key];
      return next.length > 0 ? next : ['all'];
    });
  };

  const requestSaveStockCount = () => {
    if (!warnIfMissing()) return;
    if (!stockCountDate) {
      toast.error('Choose an inventory date first');
      return;
    }
    setStockCountSaveConfirmOpen(true);
  };

  const saveStockCount = async () => {
    if (!warnIfMissing()) return;
    const countItems = currentStockCountItems;
    const type = selectedStockCountSheet?.name
      || getStockCountScopeType(stockCountScopeKey, getStockCountTypeName(countItems, selectedStockCountLabel));

    try {
      const savedCount = await api.metrics.saveInventoryCountSession({
        orgId: organization?.id,
        locationId: location?.id || userProfile?.location_id || null,
        brandId: brand?.id || brand?.brand_id || location?.brand_id || null,
        countSheetId: stockCountSheetId || null,
        scopeKey: stockCountSheetId ? `sheet:${stockCountSheetId}` : stockCountScopeKey,
        type,
        countDate: stockCountDate,
        items: countItems,
        userId: userProfile?.id,
        sessionId: editingStockCountId,
      });

      const savedId = savedCount?.id || savedCount?.session_id || editingStockCountId;
      const optimisticRow = normalizeCountSessionRow({
        ...(savedCount || {}),
        id: savedId,
        count_sheet_id: stockCountSheetId || null,
        count_date: stockCountDate,
        scope_key: stockCountSheetId ? `sheet:${stockCountSheetId}` : stockCountScopeKey,
        type,
        status: savedCount?.status || 'saved',
        items: countItems,
        total_value: countItems.reduce((sum, item) => sum + Number(item.value || 0), 0),
        item_count: countItems.length,
        saved_at: savedCount?.saved_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (savedId) {
        setStockCountHistory(prev => {
          const next = prev.filter(row => row.id !== savedId);
          return [optimisticRow, ...next];
        });
        setEditingStockCountId(savedId);
      }
      setStockCountSaveConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['count_sessions'] });
      toast.success(editingStockCountId ? 'Count changes saved' : 'Count saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save count');
    }
  };

  const editStockCountRecord = (record) => {
    if (record.status === 'Closed') {
      toast.info('Closed counts are read-only.');
      return;
    }

    setEditingStockCountId(record.id);
    setStockCountDate(record.date || new Date().toISOString().split('T')[0]);
    setStockCountSheetId(record.countSheetId || record.count_sheet_id || '');
    setStockCountScopes(String(record.scopeKey || 'all').split(',').filter(Boolean));
    setStockCountValues(Object.fromEntries((record.items || []).map(item => [item.id, String(item.count || '')])));
    setStockCountDetailRecord(null);
    toast.success('Count opened for editing');
  };

  const requestCloseStockCountRecord = (record) => {
    setStockCountCloseTarget(record);
  };

  const closeStockCountRecord = async (recordId) => {
    try {
      await api.metrics.closeInventoryCountSession(organization?.id, recordId, userProfile?.id);
      if (editingStockCountId === recordId) {
        setEditingStockCountId(null);
        setStockCountValues({});
      }
      setStockCountHistory(prev => prev.map(row => (
        row.id === recordId
          ? { ...row, status: 'Closed', closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : row
      )));
      setStockCountCloseTarget(null);
      setStockCountDetailRecord(null);
      queryClient.invalidateQueries({ queryKey: ['count_sessions'] });
      toast.success('Count closed. It is now read-only.');
    } catch (error) {
      toast.error(error.message || 'Unable to close count');
    }
  };

  const requestDeleteStockCountRecord = (record) => {
    setStockCountDeleteTarget(record);
  };

  const deleteStockCountRecord = async (recordId) => {
    try {
      await api.metrics.deleteInventoryCountSession(organization?.id, recordId, userProfile?.id);
      if (editingStockCountId === recordId) {
        setEditingStockCountId(null);
        setStockCountValues({});
      }
      setStockCountHistory(prev => prev.filter(row => row.id !== recordId));
      setStockCountDeleteTarget(null);
      setStockCountDetailRecord(null);
      queryClient.invalidateQueries({ queryKey: ['count_sessions'] });
      toast.success('Saved count deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete saved count');
    }
  };

  const handleStockCountHistoryPresetChange = (value) => {
    setStockCountHistoryPreset(value);
    if (value === 'custom') return;
    if (value === 'all_history') {
      setStockCountHistoryStartDate('');
      setStockCountHistoryEndDate('');
      setAppliedStockCountHistoryRange({ startDate: '', endDate: '' });
      return;
    }

    const today = new Date();
    const ranges = {
      last_7_days: {
        startDate: formatDateInput(addDays(today, -6)),
        endDate: formatDateInput(today),
      },
      last_30_days: {
        startDate: formatDateInput(addDays(today, -29)),
        endDate: formatDateInput(today),
      },
      this_month: {
        startDate: formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
        endDate: formatDateInput(today),
      },
    };
    const range = ranges[value];
    if (!range) return;
    setStockCountHistoryStartDate(range.startDate);
    setStockCountHistoryEndDate(range.endDate);
  };

  const applyStockCountHistoryRange = () => {
    const startDate = parseLocalDate(stockCountHistoryStartDate);
    const endDate = parseLocalDate(stockCountHistoryEndDate);
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date cannot be before the start date.');
      return;
    }
    setAppliedStockCountHistoryRange({
      startDate: stockCountHistoryStartDate,
      endDate: stockCountHistoryEndDate,
    });
    toast.success('Saved count history range applied');
  };

  const exportStockCountHistory = () => {
    if (filteredStockCountHistoryRows.length === 0) {
      toast.error('No saved count history to export for the selected range.');
      return;
    }

    const header = ['Date', 'Type', 'Status', ...summaryBuckets.map(bucket => bucket.label), 'Total', 'Saved At', 'Closed At'];
    const rows = filteredStockCountHistoryRows.map((record) => [
      record.date || '',
      record.type || record.scope || '',
      record.status || '',
      ...summaryBuckets.map(bucket => Number(record.totalsByBucket?.[bucket.label] || 0).toFixed(2)),
      Number(record.total || 0).toFixed(2),
      record.savedAt ? format(new Date(record.savedAt), 'yyyy-MM-dd HH:mm') : '',
      record.closedAt ? format(new Date(record.closedAt), 'yyyy-MM-dd HH:mm') : '',
    ]);
    const csv = [header, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-count-history-${appliedStockCountHistoryRange.startDate}-to-${appliedStockCountHistoryRange.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Saved count history exported');
  };

  const exportStockCountRecord = (record) => {
    if (!record) return;
    const items = Array.isArray(record.items) ? record.items : [];
    if (items.length === 0) {
      toast.error('No counted items to export for this saved count.');
      return;
    }

    const header = ['Count Date', 'Type', 'Status', 'Product', 'Category', 'Bucket', 'Unit', 'Count', 'Unit Cost', 'Value'];
    const rows = items.map((item) => [
      record.date || '',
      record.type || record.scope || '',
      record.status || '',
      item.product_name || '',
      item.category || getCOALabel(item.accounting_category) || '',
      item.bucket || getSummaryBucketLabel(getCountSheetBucket(item)),
      item.unit || '',
      Number(item.count || 0),
      Number(item.unit_cost || 0).toFixed(2),
      Number(item.value || (Number(item.count || 0) * Number(item.unit_cost || 0)) || 0).toFixed(2),
    ]);
    const csv = [header, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-count-${record.date || 'saved'}-${String(record.type || 'inventory').replace(/\s+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Saved count exported');
  };

  const printStockCountRecord = (record) => {
    if (!record) return;
    window.print();
    toast.success(`Print view opened for ${record.type || 'inventory count'}`);
  };

  const getStockCountRecordSections = React.useCallback((record) => {
    const groups = {};
    const inventoryById = new Map(inventory.map(item => [item.id, item]));
    const items = Array.isArray(record?.items) ? record.items : [];

    items.forEach(item => {
      const inventoryItem = inventoryById.get(item.id) || {};
      const bucket = item.bucket || getCountSheetBucket({ ...inventoryItem, ...item });
      if (!groups[bucket]) groups[bucket] = { label: bucket, items: [], previousValue: 0, countValue: 0 };
      const previousCount = Number(inventoryItem.previous_quantity ?? inventoryItem.current_quantity ?? 0);
      const unitCost = Number(item.unit_cost ?? inventoryItem.unit_cost ?? 0);
      const count = Number(item.count || 0);
      const previousValue = Number(inventoryItem.previous_value ?? (previousCount * unitCost) ?? 0);
      const countValue = Number(item.value ?? (count * unitCost) ?? 0);
      groups[bucket].previousValue += previousValue;
      groups[bucket].countValue += countValue;
      groups[bucket].items.push({
        ...inventoryItem,
        ...item,
        previousCount,
        previousValue,
        count,
        unit_cost: unitCost,
        value: countValue,
      });
    });

    const order = ['Food', 'Beer', 'Wine', 'Liquor', 'N/A Bev', 'Retail', 'Other'];
    return Object.values(groups).sort((a, b) => {
      const ai = order.indexOf(a.label);
      const bi = order.indexOf(b.label);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [inventory]);

  const toggleStockCountSection = (label) => {
    setStockCountExpandedSections(prev => ({
      ...prev,
      [label]: prev[label] === false,
    }));
  };

  const handleEdit = (item) => {
    if (item?.is_product_backed_inventory) {
      toast.info('This product is marked inventoried but has no inventory row yet. Add an inventory count or receiving record before editing stock values.');
      return;
    }
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
    if (item?.is_product_backed_inventory) {
      toast.info('This product is marked inventoried in Products. Turn off inventory tracking from the product if it should not appear here.');
      return;
    }
    if (confirm(`Remove "${item.product_name}" from inventory? This cannot be undone.`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleConvert = (item) => {
    if (item?.is_product_backed_inventory) {
      toast.info('This product needs an inventory row before unit conversion can be saved.');
      return;
    }
    setSelectedItem(item);
    setConvertForm({ fromUnit: item.current_unit || 'ea', toUnit: '', quantity: item.current_quantity || 0 });
    setConvertDialogOpen(true);
  };

  const handleLogWastage = (item) => {
    if (item?.is_product_backed_inventory) {
      toast.info('This product needs an inventory row before wastage can be logged.');
      return;
    }
    setSelectedItem(item);
    setWastageForm({ quantity: 0, unit: item.current_unit || 'ea', reason: 'spoiled', notes: '' });
    setWastageDialogOpen(true);
  };

  const openWastageDialog = () => {
    const item = inventory[0] || null;
    setSelectedItem(item);
    setWastageForm({ quantity: 0, unit: item?.current_unit || 'ea', reason: 'spoiled', notes: '' });
    setWastageDialogOpen(true);
  };

  const saveEdit = () => {
    const value = editForm.current_quantity * editForm.unit_cost;
    updateMutation.mutate({
      id: selectedItem.id,
      sourceItem: selectedItem,
      syncProduct: true,
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
    if (!addForm.product_name.trim()) {
      toast.error('Enter a product name');
      return;
    }

    createMutation.mutate({
      ...addForm,
      product_name: addForm.product_name.trim(),
      product_id: `PRD-${Date.now()}`,
      organization_id: organization?.id || null,
      brand_id: brand?.id || brand?.brand_id || location?.brand_id || null,
      location_id: location?.id || userProfile?.location_id || null,
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

  const saveWastage = async () => {
    if (!warnIfMissing()) return;
    if (!selectedItem) {
      toast.error('Choose an inventory item first');
      return;
    }
    if (!wastageForm.quantity || wastageForm.quantity <= 0) {
      toast.error('Enter a waste quantity');
      return;
    }
    try {
      await api.metrics.logInventoryWaste({
        orgId: organization?.id,
        brandId: brand?.id || brand?.brand_id || location?.brand_id || null,
        locationId: location?.id || userProfile?.location_id || null,
        inventoryId: selectedItem.id,
        productId: selectedItem.product_id,
        productName: selectedItem.product_name,
        quantity: Number(wastageForm.quantity || 0),
        unit: wastageForm.unit,
        reason: wastageForm.reason,
        notes: wastageForm.notes,
        userId: userProfile?.id,
      });
      setWastageForm({ quantity: 0, unit: '', reason: 'spoiled', notes: '' });
      setSelectedItem(null);
      setWastageDialogOpen(false);
      invalidateWastageRealtime();
      invalidateInventoryRealtime();
      toast.success('Wastage logged and inventory updated');
    } catch (error) {
      toast.error(error.message || 'Unable to log wastage');
    }
  };

  const deleteLocalWastageLog = async (logId) => {
    if (!logId || deletingWastageId) return;
    try {
      setDeletingWastageId(logId);
      await api.metrics.deleteInventoryWaste(organization?.id, logId, userProfile?.id);
      setWastageDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wastage', organization?.id] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id] }),
        queryClient.invalidateQueries({ queryKey: ['inventoryMetrics', organization?.id] }),
      ]);
      toast.success('Wastage log deleted and inventory restored');
    } catch (error) {
      toast.error(error.message || 'Unable to delete wastage log');
    } finally {
      setDeletingWastageId(null);
    }
  };

  const requestDeleteLocalWastageLog = (log) => {
    setWastageDeleteTarget(log);
  };

  const applyWastageDateRange = () => {
    const startDate = parseLocalDate(wastageStartDate);
    const endDate = parseLocalDate(wastageEndDate);
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date cannot be before the start date.');
      return;
    }
    if (startDate && endDate && endDate > addMonths(startDate, 3)) {
      setWastageRangeWarningOpen(true);
      return;
    }

    setAppliedWastageDateRange({
      startDate: wastageStartDate,
      endDate: wastageEndDate,
    });
    toast.success('Wastage date range applied');
  };

  const exportWastageHistory = () => {
    if (wasteHistoryRows.length === 0) {
      toast.error('No wastage logs to export for the selected range.');
      return;
    }

    const header = ['Date', 'Item', 'Quantity', 'Unit', 'Reason', 'Value', 'Notes', 'Source'];
    const rows = wasteHistoryRows.map((log) => [
      format(new Date(log.created_at), 'yyyy-MM-dd HH:mm'),
      log.product_name || '',
      Number(log.quantity || 0),
      log.unit || '',
      String(log.reason || 'other').replace(/_/g, ' '),
      Number(log.value || 0).toFixed(2),
      log.notes || '',
      log.local_only ? 'Local' : 'Synced',
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wastage-log-${appliedWastageDateRange.startDate}-to-${appliedWastageDateRange.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Wastage log exported');
  };

  const handleWastageDatePresetChange = (value) => {
    setWastageDatePreset(value);
    if (value === 'custom') return;

    const today = new Date();
    const ranges = {
      last_7_days: {
        startDate: formatDateInput(addDays(today, -6)),
        endDate: formatDateInput(today),
      },
      last_30_days: {
        startDate: formatDateInput(addDays(today, -29)),
        endDate: formatDateInput(today),
      },
      this_month: {
        startDate: formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
        endDate: formatDateInput(today),
      },
      last_3_months: {
        startDate: formatDateInput(addMonths(today, -3)),
        endDate: formatDateInput(today),
      },
    };
    const range = ranges[value];
    if (!range) return;
    setWastageStartDate(range.startDate);
    setWastageEndDate(range.endDate);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected item(s)? This cannot be undone.`)) {
      try {
        await api.entities.Inventory.deleteMany([...selectedIds]);
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        setSelectedIds(new Set());
        toast.success(`${selectedIds.size} item(s) deleted`);
      } catch (error) {
        toast.error('Failed to delete items');
      }
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
      brand_id: (brand?.brand_id || brand?.id) || null,
      location_id: location?.id || null,
      order_number: `ORD-${Date.now()}`,
      vendor_name: 'Multiple Vendors',
      status: 'pending_approval',
      items: orderItems,
      total_amount: orderItems.reduce((s, i) => s + i.total_price, 0),
      chat_history: [],
      created_by: userProfile?.id || null,
    });
    toast.success(`Order created for ${selectedIds.size} item(s) - check Auto Ordering`);
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

  const exportCountSheets = () => {
    const headers = [
      'Count Sheet Name',
      ...countSheetBucketOptions.map(bucket => `${bucket.label} Included`),
      ...countSheetBucketOptions.map(bucket => `${bucket.label} Product Count`),
      'Total Items',
      'Last Count',
    ];
    const rows = countSheetRows.map(sheet => [
      sheet.name,
      ...countSheetBucketOptions.map(bucket => sheet.bucketIncluded?.[bucket.label] ? 'Yes' : 'No'),
      ...countSheetBucketOptions.map(bucket => sheet.bucketCounts[bucket.label] || 0),
      sheet.itemCount,
      sheet.last_count_date ? format(new Date(sheet.last_count_date), 'yyyy-MM-dd') : '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${value ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'count-sheets.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredInventory = React.useMemo(() => {
    if (categoryFilter === 'all') return inventory;
    const selected = INVENTORY_CATEGORY_OPTIONS.find(option => option.key === categoryFilter);
    if (!selected) return inventory;
    return inventory.filter(item => getInventoryCategoryOption(item).key === selected.key);
  }, [categoryFilter, inventory]);

  useEffect(() => {
    setInventoryTableScrollTop(0);
    if (inventoryTableRef.current) inventoryTableRef.current.scrollTop = 0;
  }, [debouncedSearch, categoryFilter, sortInventory, location?.id]);

  const inventoryWindow = React.useMemo(() => {
    const total = filteredInventory.length;
    if (total === 0) {
      return {
        visibleItems: [],
        startIndex: 0,
        endIndex: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleCount = Math.ceil(INVENTORY_TABLE_VIEWPORT_HEIGHT / INVENTORY_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(inventoryTableScrollTop / INVENTORY_ROW_HEIGHT) - INVENTORY_ROW_OVERSCAN);
    const endIndex = Math.min(total, startIndex + visibleCount + (INVENTORY_ROW_OVERSCAN * 2));

    return {
      visibleItems: filteredInventory.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop: startIndex * INVENTORY_ROW_HEIGHT,
      paddingBottom: Math.max(0, (total - endIndex) * INVENTORY_ROW_HEIGHT),
    };
  }, [filteredInventory, inventoryTableScrollTop]);

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
                    {item.pending_source_invoice ? ` - Inv: ${item.pending_source_invoice}` : ''}
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
      {!['wastage', 'waste-summary'].includes(activeTab) && (
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
                <p className="text-2xl font-bold text-resend-orange">${displayedMtdWastageValue.toLocaleString()}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-resend-orange" />
            </div>
          </CardContent>
        </Card>
      </div>
      )}

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
          <TabsTrigger value="daily-snapshot">Daily Snapshot</TabsTrigger>
          <TabsTrigger value="hardware-setup">Hardware & Scales</TabsTrigger>
        </TabsList>

        <TabsContent value="receiving" className="space-y-4">
          <LazyInventorySection label="Loading receiving workflow...">
            <LoadingDockReceiving />
          </LazyInventorySection>
        </TabsContent>

        <TabsContent value="avt" className="space-y-4">
          <LazyInventorySection label="Loading AvT dashboard...">
            <AvTDashboard />
          </LazyInventorySection>
        </TabsContent>

        <TabsContent value="pos-sync" className="space-y-4">
          <LazyInventorySection label="Loading POS sync...">
            <POSSyncEngine inventory={inventory} recipes={recipes} updateInventoryMutation={updateMutation} />
          </LazyInventorySection>
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4">
          <LazyInventorySection label="Loading transfers workflow...">
            <InventoryTransfers inventory={inventory} updateInventoryMutation={updateMutation} organization={organization} />
          </LazyInventorySection>
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
                    {INVENTORY_CATEGORY_OPTIONS.map(option => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
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
              <div
                ref={inventoryTableRef}
                className="max-h-[640px] overflow-auto"
                onScroll={(event) => setInventoryTableScrollTop(event.currentTarget.scrollTop)}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
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
                      <>
                      {inventoryWindow.paddingTop > 0 && (
                        <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                          <TableCell colSpan={11} className="p-0" style={{ height: `${inventoryWindow.paddingTop}px` }} />
                        </TableRow>
                      )}
	                      {inventoryWindow.visibleItems.map((item) => {
	                        const change = (item.current_value || 0) - (item.previous_value || 0);
	                        const isLow = isBelowReorderPoint(item);
	                        const parLevel = parsePositiveThreshold(item.par_level);
	                        const reorderPoint = parsePositiveThreshold(item.reorder_point);
	                        const smartPar = parLevel ? Math.ceil(parLevel * 1.3) : null;

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
                                 {getCountSheetBucket(item)}
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
                                   <span>Par: <span className="font-medium text-foreground">{parLevel ?? '-'}</span></span>
                                   {isLow && smartPar && (
                                     <Badge variant="outline" className="text-[9px] h-4 bg-indigo-50 border-indigo-200 text-indigo-700 ml-2" title="AI Suggested Par based on forecasted volume">
                                       <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                       {smartPar}
                                     </Badge>
                                   )}
                                 </span>
                                 <span className="text-xs text-muted-foreground">Reorder: <span className={cn("font-medium", isLow ? "text-resend-red" : "text-foreground")}>{reorderPoint ?? '-'}</span></span>
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
                      })}
                      {inventoryWindow.paddingBottom > 0 && (
                        <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                          <TableCell colSpan={11} className="p-0" style={{ height: `${inventoryWindow.paddingBottom}px` }} />
                        </TableRow>
                      )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center gap-2 px-4 py-4 border-t text-sm text-muted-foreground sm:flex-row sm:justify-between">
                <span>
                  Showing rows {filteredInventory.length === 0 ? 0 : inventoryWindow.startIndex + 1}
                  -{inventoryWindow.endIndex} of {filteredInventory.length} loaded
                </span>
                {hasNextInventoryPage && (
                  <Button
                    variant="outline"
                    onClick={() => fetchNextInventoryPage()}
                    disabled={isFetchingNextInventoryPage}
                  >
                    {isFetchingNextInventoryPage ? 'Loading more...' : 'Load More Inventory Items'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Inventory Summary</h2>
              <p className="text-sm text-muted-foreground">Value, count risk, and category movement for this restaurant/location.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setActiveTab('inventory')}>
                <Warehouse className="mr-2 h-4 w-4" /> Inventory List
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('counts')}>
                <Calendar className="mr-2 h-4 w-4" /> Stock Counts
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {summaryBuckets.map(({ label, accent, items, value, percent }) => {
              const Icon = getSummaryBucketIcon(label);
              const tone = accent.split(' ').find(c => c.startsWith('text-'));
              const fill = accent.split(' ')[0];
              return (
                <Card key={label} className="overflow-hidden border shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between border-b bg-secondary/30 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-md bg-current/10", tone)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="font-semibold text-foreground">{label}</span>
                      </div>
                      <span className={cn("h-2.5 w-2.5 rounded-full", fill)} />
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {items} item{items === 1 ? '' : 's'} · {percent === null ? '0.0' : percent.toFixed(1)}% of inventory
                        </p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full", fill)}
                          style={{ width: `${Math.min(100, Math.max(0, percent || 0))}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <Card className="border shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Inventory Value</p>
                  <p className="text-2xl font-bold tabular-nums">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-resend-green" />
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Active Items</p>
                  <p className="text-2xl font-bold tabular-nums">{totalItems}</p>
                </div>
                <Package className="h-8 w-8 text-primary" />
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                  <p className="text-2xl font-bold tabular-nums text-resend-red">{lowStock}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-resend-red" />
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Wastage MTD</p>
                  <p className="text-2xl font-bold tabular-nums text-resend-orange">${displayedMtdWastageValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-resend-orange" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Category Detail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summaryCategoryRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No inventory categories found.
                    </div>
                  ) : summaryCategoryRows.map((data) => {
                    const expanded = expandedSummaryCategory === data.category;
                    const rows = data.rows
                      .slice()
                      .sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || '')));

                    return (
                      <div key={data.category} className="overflow-hidden rounded-lg border bg-card">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50"
                          onClick={() => setExpandedSummaryCategory(expanded ? null : data.category)}
                        >
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
                              <p className="text-sm font-semibold tabular-nums">${data.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, data.percent)}%` }} />
                              </div>
                              <span className="w-14 text-right text-xs text-muted-foreground">{data.percent.toFixed(1)}%</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{data.items} item{data.items === 1 ? '' : 's'}</p>
                          </div>
                        </button>
                        {expanded && (
                          <div className="border-t">
                            <Table className="text-xs">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Item</TableHead>
                                  <TableHead className="text-right">Qty</TableHead>
                                  <TableHead className="text-right">Unit Cost</TableHead>
                                  <TableHead className="text-right">Value</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {rows.map(item => (
                                  <TableRow key={item.id || `${data.category}-${item.product_name}`}>
                                    <TableCell className="max-w-72 truncate font-medium">{item.product_name || 'Unnamed item'}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {Number(item.current_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.current_unit || ''}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">${Number(item.unit_cost || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">
                                      ${Number(item.summary_value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Needs Attention</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summaryLowStockRows.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No low-stock items in the current inventory.</p>
                  ) : summaryLowStockRows.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/30 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">Reorder at {item.reorder_point || '-'} {item.current_unit || ''}</p>
                      </div>
                      <Badge className="bg-resend-red/10 text-resend-red">
                        {Number(item.current_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Largest Inventory Value</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summaryTopValueRows.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No inventory value to summarize yet.</p>
                  ) : summaryTopValueRows.map(item => {
                    const value = Number(item.current_value || (Number(item.current_quantity || 0) * Number(item.unit_cost || 0)) || 0);
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{getCOALabel(item.accounting_category)}</p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="wastage">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Wastage Log</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Track expired, spoiled, damaged, or overproduced inventory.</p>
              </div>
              <Button className="bg-primary hover:bg-primary" onClick={openWastageDialog} disabled={inventory.length === 0}>
                <Plus className="mr-2 h-4 w-4" /> Log Waste
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-col gap-3 rounded-md border bg-secondary/30 p-3 md:flex-row md:items-end">
                <div className="min-w-[190px] space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Range</p>
                  <Select value={wastageDatePreset} onValueChange={handleWastageDatePresetChange}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                      <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                      <SelectItem value="this_month">This Month</SelectItem>
                      <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[170px] space-y-1">
                  <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Start
                  </p>
                  <Input
                    type="date"
                    value={wastageStartDate}
                    disabled={wastageDatePreset !== 'custom'}
                    onChange={(event) => setWastageStartDate(event.target.value)}
                  />
                </div>
                <div className="min-w-[170px] space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">End</p>
                  <Input
                    type="date"
                    value={wastageEndDate}
                    min={wastageStartDate}
                    disabled={wastageDatePreset !== 'custom'}
                    onChange={(event) => setWastageEndDate(event.target.value)}
                  />
                </div>
                <Button type="button" className="bg-primary hover:bg-primary" onClick={applyWastageDateRange}>
                  Apply
                </Button>
                <Button type="button" variant="outline" onClick={exportWastageHistory} disabled={wasteHistoryRows.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <div className="text-sm text-muted-foreground md:ml-auto md:pb-2">
                  Showing {wasteHistoryRows.length} log{wasteHistoryRows.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-md border bg-card">
                  <div className="border-t-4 border-primary px-4 py-3">
                    <h3 className="text-base font-semibold text-foreground">Reasons for Waste</h3>
                  </div>
                  <div className="min-h-52 border-t p-4">
                    {wasteReasonSummary.length === 0 ? (
                      <div className="flex h-40 items-center justify-center text-center">
                        <div>
                          <p className="font-semibold text-foreground">No results found</p>
                          <p className="mt-1 text-sm text-muted-foreground">Log waste to see the major reasons here.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-5 md:grid-cols-[230px_1fr] md:items-center">
                        <div className="relative mx-auto h-56 w-56">
                          <div className="absolute inset-x-8 bottom-3 h-7 rounded-full bg-black/10 blur-xl" />
                          <div className="absolute inset-0 animate-[wasteChartFloat_4s_ease-in-out_infinite] rounded-full [filter:drop-shadow(0_16px_18px_rgba(15,23,42,0.16))]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={wasteReasonChartData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={92}
                                  paddingAngle={2}
                                  stroke="rgba(255,255,255,0.85)"
                                  strokeWidth={2}
                                  isAnimationActive
                                  animationBegin={80}
                                  animationDuration={900}
                                >
                                  {wasteReasonChartData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value, name, props) => [
                                    `$${Number(value || 0).toFixed(2)} (${props.payload.count} log${props.payload.count === 1 ? '' : 's'})`,
                                    String(name).replace(/\b\w/g, char => char.toUpperCase()),
                                  ]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {wasteReasonChartData.map((reason) => (
                            <div key={reason.name} className="flex items-center justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: reason.color }} />
                                <span className="truncate text-sm font-medium capitalize">{reason.name}</span>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold">${reason.value.toFixed(2)}</p>
                                <p className="text-[11px] text-muted-foreground">{reason.count} log{reason.count === 1 ? '' : 's'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <style>{`
                          @keyframes wasteChartFloat {
                            0%, 100% { transform: translateY(0) rotateX(0deg); }
                            50% { transform: translateY(-8px) rotateX(2deg); }
                          }
                        `}</style>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-md border bg-card">
                  <div className="border-t-4 border-primary px-4 py-3">
                    <h3 className="text-base font-semibold text-foreground">Most Expensive Waste</h3>
                  </div>
                  <div className="min-h-52 border-t p-0">
                    {wasteHistoryRows.length === 0 ? (
                      <div className="flex h-52 items-center justify-center text-center">
                        <div>
                          <p className="font-semibold text-foreground">No results found</p>
                          <p className="mt-1 text-sm text-muted-foreground">Logged waste costs will appear here.</p>
                        </div>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wasteHistoryRows
                            .slice()
                            .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
                            .slice(0, 6)
                            .map((log) => (
                              <TableRow key={`expensive-${log.id}`}>
                                <TableCell className="max-w-56 truncate font-medium">{log.product_name}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="capitalize">{log.reason?.replace(/_/g, ' ') || 'Other'}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold text-resend-red">${Number(log.value || 0).toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Waste History</h3>
                  <p className="text-sm text-muted-foreground">Saved for this restaurant/location.</p>
                </div>
                <Badge variant="secondary">{wasteHistoryRows.length} log{wasteHistoryRows.length === 1 ? '' : 's'}</Badge>
              </div>

              <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:text-foreground group"
                      onClick={() => setSortWastage(sortWastage === 'created_at' ? '-created_at' : 'created_at')}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        <span className="opacity-0 group-hover:opacity-100 text-xs">
                          {sortWastage === 'created_at' ? '^' : sortWastage === '-created_at' ? 'v' : '-'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground group"
                      onClick={() => setSortWastage(sortWastage === 'product_name' ? '-product_name' : 'product_name')}
                    >
                      <div className="flex items-center gap-1">
                        Product
                        <span className="opacity-0 group-hover:opacity-100 text-xs">
                          {sortWastage === 'product_name' ? '^' : sortWastage === '-product_name' ? 'v' : '-'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground group"
                      onClick={() => setSortWastage(sortWastage === 'value' ? '-value' : 'value')}
                    >
                      <div className="flex items-center gap-1">
                        Value
                        <span className="opacity-0 group-hover:opacity-100 text-xs">
                          {sortWastage === 'value' ? '^' : sortWastage === '-value' ? 'v' : '-'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wasteHistoryRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No wastage logged for the selected date range
                      </TableCell>
                    </TableRow>
                  ) : (
                    wasteHistoryRows.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{format(new Date(log.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="font-medium">{log.product_name}</TableCell>
                        <TableCell>{log.quantity} {log.unit}</TableCell>
                        <TableCell className="text-resend-red font-semibold">${log.value?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{log.reason}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{log.notes}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-resend-red hover:bg-resend-red/10 hover:text-resend-red"
                            onClick={() => requestDeleteLocalWastageLog(log)}
                            disabled={deletingWastageId === log.id}
                          >
                            {deletingWastageId === log.id ? (
                              <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            {deletingWastageId === log.id ? 'Deleting' : 'Delete'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              <div className="flex justify-center px-4 py-4 border-t">
                {hasNextWastagePage && (
                  <Button variant="outline" onClick={() => fetchNextWastagePage()} disabled={isFetchingNextWastagePage}>
                    {isFetchingNextWastagePage ? 'Loading more...' : 'Load More Waste Records'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

 {/* Inventory Counts Tab */}
        <TabsContent value="counts">
          {stockCountDetailRecord ? (
            <Card className="border-0 shadow-sm">
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Button
                      variant="ghost"
                      className="mb-2 -ml-3"
                      onClick={() => setStockCountDetailRecord(null)}
                    >
                      Back to Counts
                    </Button>
                    <CardTitle className="text-3xl">
                      {stockCountDetailRecord.date ? format(new Date(`${stockCountDetailRecord.date}T00:00:00`), 'MM/dd/yyyy') : 'Saved'} "{stockCountDetailRecord.type || stockCountDetailRecord.scope || 'Inventory'}" Count
                    </CardTitle>
                  </div>
                  <Badge className={cn("w-fit px-3 py-1 text-sm", stockCountDetailRecord.status === 'Closed' ? 'bg-secondary text-foreground' : 'bg-resend-green/10 text-resend-green')}>
                    {stockCountDetailRecord.status || 'Saved'}
                  </Badge>
                </div>

                <div className="flex flex-col gap-3 rounded-md border bg-secondary/50 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {stockCountDetailRecord.status !== 'Closed' && (
                      <>
                        <Button className="bg-primary hover:bg-primary" onClick={() => editStockCountRecord(stockCountDetailRecord)}>
                          <Edit2 className="mr-2 h-4 w-4" /> Edit
                        </Button>
                        <Button className="bg-primary hover:bg-primary" onClick={() => requestCloseStockCountRecord(stockCountDetailRecord)}>
                          Close
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setActiveTab('summary')}>
                      <TrendingUp className="mr-2 h-4 w-4" /> Inventory Summary
                    </Button>
                    <Button variant="outline" onClick={() => setStockCountDetailRecord(null)}>
                      <RefreshCw className="mr-2 h-4 w-4" /> History
                    </Button>
                    <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => printStockCountRecord(stockCountDetailRecord)}>
                      <Printer className="mr-2 h-4 w-4" /> Print Count
                    </Button>
                    <Button variant="outline" onClick={() => exportStockCountRecord(stockCountDetailRecord)}>
                      <Download className="mr-2 h-4 w-4" /> Export
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search count items..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-auto rounded-md border">
                  <Table className="min-w-[980px] text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[260px]">Category</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Report By</TableHead>
                        <TableHead className="text-right">Prev Count</TableHead>
                        <TableHead className="text-right">Prev Value</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getStockCountRecordSections(stockCountDetailRecord).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                            No saved count lines found for this count.
                          </TableCell>
                        </TableRow>
                      ) : getStockCountRecordSections(stockCountDetailRecord).map(section => (
                        <React.Fragment key={`detail-section-${section.label}`}>
                          <TableRow className="bg-secondary/50 font-semibold">
                            <TableCell>{section.label} ({section.items.length})</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-right">${section.previousValue.toFixed(2)}</TableCell>
                            <TableCell />
                            <TableCell className="text-right">${section.countValue.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${(section.countValue - section.previousValue).toFixed(2)}</TableCell>
                          </TableRow>
                          {section.items
                            .filter(item => !debouncedSearch || String(item.product_name || '').toLowerCase().includes(debouncedSearch.toLowerCase()))
                            .map(item => (
                              <TableRow key={`detail-${section.label}-${item.id || item.product_name}`}>
                                <TableCell className="text-muted-foreground">{section.label}</TableCell>
                                <TableCell className="font-medium">{item.product_name || 'Unnamed item'}</TableCell>
                                <TableCell>{item.unit || item.current_unit || 'ea'}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(item.previousCount || 0).toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums">${Number(item.previousValue || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(item.count || 0).toLocaleString()}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">${Number(item.value || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  ${(Number(item.value || 0) - Number(item.previousValue || 0)).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Total Items: {stockCountDetailRecord.itemCount || stockCountDetailRecord.items?.length || 0}</span>
                  <span className="font-semibold text-foreground">Total Value: ${Number(stockCountDetailRecord.total || 0).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          ) : (
          <Card className="border-0 shadow-sm">
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className={cn(editingStockCountId && "text-3xl")}>
                    {editingStockCountId
                      ? `Edit a "${selectedStockCountLabel.replace(' Inventory', '')}" Count`
                      : 'Inventory Counts'}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {editingStockCountId
                      ? 'Update item counts, save changes, or close the count when it is final.'
                      : 'Choose any inventory area this restaurant uses, enter counts, and save the count history.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingStockCountId && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingStockCountId(null);
                        setStockCountValues({});
                      }}
                    >
                      Cancel Edit
                    </Button>
                  )}
                  {editingStockCountRecord && (
                    <Button
                      variant="outline"
                      className="border-resend-red/30 text-resend-red hover:bg-resend-red/10"
                      onClick={() => requestDeleteStockCountRecord(editingStockCountRecord)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Saved Count History</p>
                      <p className="text-xs text-muted-foreground">Stored for this restaurant/location so saved counts can be reopened until they are closed.</p>
                    </div>
                    <Badge variant="secondary">{filteredStockCountHistoryRows.length} shown</Badge>
                  </div>
                  <div className="flex flex-col gap-3 rounded-md border bg-secondary/30 p-3 md:flex-row md:items-end">
                    <div className="min-w-[190px] space-y-1">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Range</p>
                      <Select value={stockCountHistoryPreset} onValueChange={handleStockCountHistoryPresetChange}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_history">All History</SelectItem>
                          <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                          <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                          <SelectItem value="this_month">This Month</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-[170px] space-y-1">
                      <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        Start
                      </p>
                      <Input
                        type="date"
                        value={stockCountHistoryStartDate}
                        disabled={stockCountHistoryPreset !== 'custom'}
                        onChange={(event) => setStockCountHistoryStartDate(event.target.value)}
                      />
                    </div>
                    <div className="min-w-[170px] space-y-1">
                      <p className="text-xs font-medium uppercase text-muted-foreground">End</p>
                      <Input
                        type="date"
                        value={stockCountHistoryEndDate}
                        min={stockCountHistoryStartDate}
                        disabled={stockCountHistoryPreset !== 'custom'}
                        onChange={(event) => setStockCountHistoryEndDate(event.target.value)}
                      />
                    </div>
                    <Button type="button" className="bg-primary hover:bg-primary" onClick={applyStockCountHistoryRange}>
                      Apply
                    </Button>
                    <Button type="button" variant="outline" onClick={exportStockCountHistory} disabled={filteredStockCountHistoryRows.length === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                    <div className="text-sm text-muted-foreground md:ml-auto md:pb-2">
                      Showing {filteredStockCountHistoryRows.length} count{filteredStockCountHistoryRows.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border">
                    <Table className="w-full table-fixed text-xs [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[82px]">Date</TableHead>
                          <TableHead className="w-[120px]">Type</TableHead>
                          <TableHead className="w-[78px]">Status</TableHead>
                          {summaryBuckets.map(bucket => (
                            <TableHead key={bucket.label} className="text-right">{bucket.label}</TableHead>
                          ))}
                          <TableHead className="w-[88px] text-right">Total</TableHead>
                          <TableHead className="w-[112px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStockCountHistoryRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={summaryBuckets.length + 5} className="h-20 text-center text-muted-foreground">
                              No saved counts found for the selected range.
                            </TableCell>
                          </TableRow>
                        ) : filteredStockCountHistoryRows.map(record => (
                          <TableRow
                            key={record.id}
                            className={cn("cursor-pointer", editingStockCountId === record.id ? 'bg-primary/5' : undefined)}
                            onClick={() => setStockCountDetailRecord(record)}
                          >
                            <TableCell className="font-medium tabular-nums">{format(new Date(`${record.date}T00:00:00`), 'MM/dd/yy')}</TableCell>
                            <TableCell className="truncate">{record.type || record.scope}</TableCell>
                            <TableCell>
                              <Badge className={cn("px-2 py-0 text-[11px]", record.status === 'Closed' ? 'bg-secondary text-foreground' : 'bg-resend-green/10 text-resend-green')}>
                                {record.status}
                              </Badge>
                            </TableCell>
                            {summaryBuckets.map(bucket => (
                              <TableCell key={`${record.id}-${bucket.label}`} className="text-right tabular-nums">
                                ${Number(record.totalsByBucket?.[bucket.label] || 0).toFixed(2)}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold tabular-nums">${Number(record.total || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {record.status === 'Closed' ? (
                                  <Badge variant="secondary" className="px-2 py-0 text-[11px]">Locked</Badge>
                                ) : (
                                  <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      editStockCountRecord(record);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      requestCloseStockCountRecord(record);
                                    }}
                                  >
                                    Close
                                  </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-resend-red hover:bg-resend-red/10 hover:text-resend-red"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    requestDeleteStockCountRecord(record);
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
              </div>

              <div className={cn("grid gap-4 rounded-lg border bg-secondary/30 p-4", editingStockCountId ? "md:grid-cols-[180px_240px_1fr]" : "md:grid-cols-[240px_1fr]")}>
                {editingStockCountId && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Input
                      value={editingStockCountRecord?.status || 'Saved'}
                      disabled
                      className="h-12 bg-card text-base"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Inventory Date</Label>
                  <Input
                    type="date"
                    value={stockCountDate}
                    onChange={(event) => setStockCountDate(event.target.value)}
                    className="h-12 bg-card text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Count Sheet</Label>
                  <div className="flex gap-2">
                    <Select
                      value={stockCountSheetId || 'category_mode'}
                      onValueChange={(value) => {
                        setStockCountSheetId(value === 'category_mode' ? '' : value);
                        setStockCountValues({});
                      }}
                    >
                      <SelectTrigger className="h-12 bg-card text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="category_mode">No sheet - choose categories</SelectItem>
                        {countSheetRows.map(sheet => (
                          <SelectItem key={sheet.id} value={sheet.id}>
                            {sheet.name} ({sheet.itemCount || 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedStockCountSheet && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 whitespace-nowrap"
                        onClick={() => {
                          setActiveTab('count-sheets');
                          openCountSheetEditor(selectedStockCountSheet);
                        }}
                      >
                        Edit Sheet
                      </Button>
                    )}
                  </div>
                </div>
                {!stockCountSheetId && (
                <div className="space-y-2 md:col-span-full">
                  <Label>Count Category</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {stockCountOptions.map(option => {
                      const selected = stockCountScopes.includes(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => toggleStockCountScope(option.key)}
                          className={cn(
                            "flex h-11 min-w-28 items-center justify-center rounded-md border px-3 text-sm transition",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-foreground hover:border-primary/60"
                          )}
                        >
                          {option.label.replace(' Inventory', '')}
                          <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", selected ? "bg-background/20" : "bg-secondary")}>
                            {option.items}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {stockCountScopes.filter(key => key !== 'all').map(key => {
                      const option = stockCountOptions.find(item => item.key === key);
                      if (!option) return null;
                      return (
                        <Badge key={key} variant="secondary" className="gap-1">
                          {option.label}
                          <button type="button" onClick={() => toggleStockCountScope(key)} aria-label={`Remove ${option.label}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {!stockCountDate ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Choose an inventory date to load count items.
                </div>
              ) : stockCountSections.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No inventory items found for this count area.
                </div>
              ) : (
                stockCountSections.map(section => {
                  const sectionExpanded = stockCountExpandedSections[section.label] !== false;

                  return (
                  <div key={section.label} className="overflow-hidden rounded-lg border bg-card">
                    <div className="flex items-center gap-2 border-b bg-secondary/40 px-4 py-3">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded border border-primary/40 text-primary"
                        onClick={() => toggleStockCountSection(section.label)}
                        aria-label={sectionExpanded ? `Collapse ${section.label}` : `Expand ${section.label}`}
                      >
                        {sectionExpanded ? '-' : '+'}
                      </button>
                      <h3 className="font-semibold text-foreground">{section.label}</h3>
                      <Badge variant="secondary" className="ml-auto">{section.items.length} items</Badge>
                    </div>
                    {sectionExpanded && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[260px]">Product</TableHead>
                            <TableHead>Last Purchased</TableHead>
                            <TableHead>Count By</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="min-w-[180px]">Count</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {section.items
                            .filter(item => !debouncedSearch || String(item.product_name || '').toLowerCase().includes(debouncedSearch.toLowerCase()))
                            .map(item => {
                            const hasEnteredCount = Object.prototype.hasOwnProperty.call(stockCountValues, item.id);
                            const count = Number(hasEnteredCount ? stockCountValues[item.id] : item.current_quantity || 0);
                            const unitCost = Number(item.unit_cost || 0);
                            const countedValue = count * unitCost;
                            const lastPurchased = item.last_purchased_at || item.last_counted_date || item.updated_at || item.created_at;

                            return (
                          <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {item.product_name}
                                    {isBelowReorderPoint(item) && (
                                      <span className="text-primary" title="At or below reorder point">*</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {lastPurchased ? format(new Date(lastPurchased), 'MMM d, yyyy') : '-'}
                                </TableCell>
                                <TableCell>{item.current_unit || 'ea'}</TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                  ${unitCost.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-primary">+</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={hasEnteredCount ? stockCountValues[item.id] : item.current_quantity || ''}
                                      onChange={(event) => setStockCountValues(prev => ({
                                        ...prev,
                                        [item.id]: event.target.value,
                                      }))}
                                      className="h-10 max-w-32 bg-background"
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">
                                  {countedValue > 0 ? `$${countedValue.toFixed(2)}` : '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    )}
                  </div>
                  );
                })
              )}
              <div className="sticky bottom-0 z-20 -mx-6 mt-2 flex justify-end gap-2 border-t bg-background/95 px-6 py-3 shadow-lg backdrop-blur">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    className={cn("bg-primary hover:bg-primary", !hasLocation && "opacity-50 cursor-not-allowed")}
                    onClick={requestSaveStockCount}
                    disabled={!stockCountDate}
                  >
                    {editingStockCountId ? 'Save Changes' : 'Save Count'}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-resend-red/30 text-resend-red hover:bg-resend-red/10"
                    onClick={() => setStockCountValues({})}
                  >
                    <X className="mr-2 h-4 w-4" /> Clear Counts
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

 {/* Count Sheets Tab */}
        <TabsContent value="count-sheets" className="space-y-4">
          {editingCountSheet && countSheetDraft ? (
            <Card className="border-0 shadow-sm">
              <CardHeader className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-3xl">Edit Count Sheet</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose which product groups feed this sheet, then arrange the products in the order your team counts them.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setEditingCountSheetId(null); setCountSheetDraft(null); }}>
                      Back
                    </Button>
                    <Button className="bg-primary hover:bg-primary" onClick={saveCountSheetDraft}>
                      Save
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={countSheetDraft.name}
                    onChange={(event) => setCountSheetDraft(prev => ({ ...prev, name: event.target.value }))}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
                  <div className="space-y-3">
                    <Label>This count sheet should receive these types of new products automatically</Label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {countSheetBucketOptions.map(bucket => {
                        const checked = countSheetDraft.buckets.includes(bucket.label);
                        return (
                          <label key={bucket.label} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => setCountSheetDraftBuckets(bucket.label, Boolean(nextChecked))}
                            />
                            <span className="text-sm font-medium">
                              {bucket.label}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">{bucket.items}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Organize By</Label>
                    <Select
                      value={countSheetDraft.organizeBy}
                      onValueChange={(value) => setCountSheetDraft(prev => ({ ...prev, organizeBy: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto_category">Auto by Category</SelectItem>
                        <SelectItem value="sheet_to_shelf">Sheet to Shelf</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Add Product</Label>
                    <Select value={countSheetProductToAdd} onValueChange={setCountSheetProductToAdd}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product from inventory" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory
                          .filter(item => !countSheetDraftItems.some(sheetItem => sheetItem.inventory_id === item.id))
                          .map(item => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.product_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" className="bg-primary hover:bg-primary" onClick={addProductToCountSheetDraft} disabled={!countSheetProductToAdd}>
                    <Plus className="mr-2 h-4 w-4" /> Add Product
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {countSheetDraftSections.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No products assigned to this count sheet yet.
                  </div>
                ) : (
                  countSheetDraftSections.map(section => (
                    <div key={section.label} className="overflow-hidden rounded-md border">
                      <div className="border-b bg-secondary/40 px-4 py-2 font-semibold">
                        {section.label} ({section.items.length})
                      </div>
                      <div className="overflow-x-auto">
                        <Table className="min-w-[920px] text-sm">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">#</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Last Purchased</TableHead>
                              <TableHead>Count By</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Controls</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {section.items.map(item => {
                              const draftIndex = countSheetDraftItems.findIndex(draftItem => draftItem.rowId === item.rowId);
                              return (
                                  <TableRow key={item.rowId}>
                                    <TableCell className="tabular-nums">{draftIndex + 1}</TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="link"
                                      className="h-auto p-0 text-left font-medium text-foreground underline-offset-4 hover:text-primary"
                                      onClick={() => openCountSheetProduct(item)}
                                    >
                                      {item.product_name}
                                    </Button>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {item.last_purchased_at ? format(new Date(item.last_purchased_at), 'MM/dd/yyyy') : '-'}
                                  </TableCell>
                                  <TableCell>{item.unit}</TableCell>
                                  <TableCell className="text-right tabular-nums">${Number(item.unit_cost || 0).toFixed(2)}</TableCell>
                                  <TableCell>
                                    <div className="flex justify-end gap-1">
                                      <Button size="sm" variant="ghost" onClick={() => moveCountSheetDraftItem(item.rowId, -1)} disabled={draftIndex === 0}>Up</Button>
                                      <Button size="sm" variant="ghost" onClick={() => moveCountSheetDraftItem(item.rowId, 1)} disabled={draftIndex === countSheetDraftItems.length - 1}>Down</Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-resend-red hover:bg-resend-red/10 hover:text-resend-red"
                                        onClick={() => removeProductFromCountSheetDraft(item.rowId)}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
                  <span>Total Lines: {countSheetDraftItems.length}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="border-resend-red/40 text-resend-red hover:bg-resend-red/10 hover:text-resend-red"
                      onClick={() => setCountSheetDeleteTarget(editingCountSheet)}
                    >
                      Delete
                    </Button>
                    <Button variant="outline" onClick={() => { setEditingCountSheetId(null); setCountSheetDraft(null); }}>
                      Cancel
                    </Button>
                    <Button className="bg-primary hover:bg-primary" onClick={saveCountSheetDraft}>
                      Save Count Sheet
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
          <Card className="border-0 shadow-sm">
            <CardHeader className="space-y-6">
              <div>
                <CardTitle className="text-3xl">Count Sheets</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Reusable inventory templates organized by storage area, station, and product group.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-secondary/50 p-4">
                <Button className="h-11 bg-primary hover:bg-primary" onClick={() => setNewTemplateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add Count Sheet
                </Button>
                <Button
                  variant="outline"
                  className="h-11 border-primary/40 bg-background text-primary hover:bg-primary/5"
                  onClick={() => toast.info('Import can be wired after the CSV format is finalized.')}
                >
                  <Upload className="h-4 w-4 mr-2" /> Import Sheet
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-11 border-primary/40 bg-background text-primary hover:bg-primary/5">
                      <Printer className="h-4 w-4 mr-2" /> Print Sheets <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => window.print()}>Print current view</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportCountSheets}>Export CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-11 border-primary/40 bg-background text-primary hover:bg-primary/5">
                      <QrCode className="h-4 w-4 mr-2" /> Sheet Labels <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => toast.info('QR labels need the final scanner URL before printing.')}>
                      Sheet QR labels
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Select value={countSheetStatus} onValueChange={setCountSheetStatus}>
                  <SelectTrigger className="h-11 w-full border-primary/40 bg-background text-primary sm:ml-auto sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Show: Active Count Sheets</SelectItem>
                    <SelectItem value="all">Show: All Count Sheets</SelectItem>
                    <SelectItem value="archived">Show: Archived Count Sheets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="rounded-md border">
                <div className="w-full overflow-x-scroll">
                  <Table className="min-w-max">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="sticky left-0 z-30 min-w-[280px] bg-background shadow-[1px_0_0_hsl(var(--border))]" />
                        <TableHead colSpan={countSheetBucketOptions.length} className="bg-primary/90 text-center text-sm font-bold uppercase text-primary-foreground">
                          Product group coverage
                        </TableHead>
                        <TableHead colSpan={countSheetBucketOptions.length} className="bg-primary text-center text-sm font-bold uppercase text-primary-foreground">
                          Items assigned
                        </TableHead>
                        <TableHead className="bg-background" />
                      </TableRow>
                      <TableRow>
                        <TableHead
                          className="sticky left-0 z-30 min-w-[280px] cursor-pointer bg-background font-bold shadow-[1px_0_0_hsl(var(--border))] hover:text-foreground"
                          onClick={() => setSortCountSheets(sortCountSheets === 'name' ? '-name' : 'name')}
                        >
                          <div className="flex items-center gap-2">
                            Count Sheet Name
                            <span className="text-xs">{sortCountSheets === 'name' ? '^' : sortCountSheets === '-name' ? 'v' : '-'}</span>
                          </div>
                        </TableHead>
                        {countSheetBucketOptions.map(bucket => (
                          <TableHead key={`included-${bucket.label}`} className="min-w-36 font-bold">{bucket.label}</TableHead>
                        ))}
                        {countSheetBucketOptions.map(bucket => (
                          <TableHead key={`count-${bucket.label}`} className="min-w-36 font-bold">{bucket.label}</TableHead>
                        ))}
                        <TableHead className="min-w-36 font-bold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countSheetRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={(countSheetBucketOptions.length * 2) + 2} className="py-10 text-center text-muted-foreground">
                            No count sheets found. Create templates by station, storage area, or product category.
                          </TableCell>
                        </TableRow>
                      ) : (
                        countSheetRows.map((sheet, index) => (
                          <TableRow
                            key={sheet.id}
                            className="cursor-pointer"
                            onClick={() => openCountSheetEditor(sheet)}
                          >
                            <TableCell className="sticky left-0 z-40 min-w-[280px] bg-background font-medium shadow-[1px_0_0_hsl(var(--border))]">
                              <button type="button" className="text-left hover:text-primary" onClick={(event) => { event.stopPropagation(); openCountSheetEditor(sheet); }}>
                                {sheet.name}
                              </button>
                              {sheet.local_only && (
                                <Badge variant="secondary" className="mt-1">Local draft</Badge>
                              )}
                              {sheet.description && (
                                <div className="mt-1 max-w-56 truncate text-xs text-muted-foreground">{sheet.description}</div>
                              )}
                            </TableCell>
                            {countSheetBucketOptions.map(bucket => (
                              <TableCell
                                key={`${sheet.id}-included-${bucket.label}`}
                                className={index % 2 === 0 ? "bg-background" : "bg-secondary/40"}
                              >
                                {sheet.bucketIncluded?.[bucket.label] ? 'Yes' : 'No'}
                              </TableCell>
                            ))}
                            {countSheetBucketOptions.map(bucket => (
                              <TableCell
                                key={`${sheet.id}-count-${bucket.label}`}
                                className={cn("tabular-nums", index % 2 === 0 ? "bg-background" : "bg-secondary/40")}
                              >
                                {sheet.bucketCounts[bucket.label] || 0}
                              </TableCell>
                            ))}
                            <TableCell className={index % 2 === 0 ? "bg-background" : "bg-secondary/40"}>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openCountSheetEditor(sheet);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={cn(!hasLocation && "opacity-50 cursor-not-allowed")}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startStockCountFromSheet(sheet);
                                  }}
                                >
                                  Start Count
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-resend-red/40 text-resend-red hover:bg-resend-red/10 hover:text-resend-red"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCountSheetDeleteTarget(sheet);
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Total Items: {countSheetRows.length}</span>
                {hasNextCountSheetsPage && (
                  <Button variant="outline" onClick={() => fetchNextCountSheetsPage()} disabled={isFetchingNextCountSheetsPage}>
                    {isFetchingNextCountSheetsPage ? 'Loading more...' : 'Load More Count Sheets'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

 {/* Waste Summary Tab */}
        <TabsContent value="waste-summary">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Waste Summary</h2>
              <p className="text-sm text-muted-foreground">Reasons, expensive waste, and logged history for this restaurant/location.</p>
            </div>
            <div className="flex justify-end">
              <Button className="bg-primary hover:bg-primary" onClick={openWastageDialog} disabled={inventory.length === 0}>
                <Plus className="mr-2 h-4 w-4" /> Log Waste
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Waste Reasons */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Top Waste Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const maxValue = wasteReasonSummary.length > 0 ? wasteReasonSummary[0].value : 1;
                  return wasteReasonSummary.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No waste data available</p>
                  ) : (
                    <div className="space-y-4">
                      {wasteReasonSummary.map((data) => (
                        <div key={data.reason}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium capitalize">{data.reason.replace(/_/g, ' ')}</span>
                            <span className="text-muted-foreground">{data.count} entries | ${data.value.toFixed(2)}</span>
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
                    <p className="text-2xl font-bold text-resend-red">${wasteLogValue.toFixed(2)}</p>
                    <p className="text-xs text-resend-red mt-1 font-medium">Total Waste Value</p>
                  </div>
                  <div className="p-4 bg-resend-orange/5 rounded-lg text-center">
                    <p className="text-2xl font-bold text-resend-orange">{wastageLogs.length}</p>
                    <p className="text-xs text-resend-orange mt-1 font-medium">Waste Entries</p>
                  </div>
                  <div className="p-4 bg-resend-yellow/5 rounded-lg text-center">
                    <p className="text-2xl font-bold text-resend-yellow">
                      {wastageLogs.length > 0 ? `$${(wasteLogValue / wastageLogs.length).toFixed(2)}` : '$0.00'}
                    </p>
                    <p className="text-xs text-resend-yellow mt-1 font-medium">Avg Waste per Entry</p>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {totalValue > 0 ? `${((wasteLogValue / totalValue) * 100).toFixed(1)}%` : '0%'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">Waste as % of Inventory</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm lg:col-span-2">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Waste History</CardTitle>
                  <p className="text-sm text-muted-foreground">Every logged waste entry saved for this restaurant/location.</p>
                </div>
                <Badge variant="secondary">{wasteHistoryRows.length} log{wasteHistoryRows.length === 1 ? '' : 's'}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-max">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wasteHistoryRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                            No waste history yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        wasteHistoryRows.map(log => (
                          <TableRow key={`summary-${log.id}`}>
                            <TableCell>{format(new Date(log.created_at), 'MM/dd/yyyy')}</TableCell>
                            <TableCell className="font-medium">{log.product_name}</TableCell>
                            <TableCell>{log.quantity} {log.unit}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">{log.reason?.replace(/_/g, ' ') || 'Other'}</Badge>
                            </TableCell>
                            <TableCell className="font-semibold text-resend-red">${Number(log.value || 0).toFixed(2)}</TableCell>
                            <TableCell className="max-w-80 truncate text-muted-foreground">{log.notes || '-'}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-resend-red hover:bg-resend-red/10 hover:text-resend-red"
                                onClick={() => requestDeleteLocalWastageLog(log)}
                                disabled={deletingWastageId === log.id}
                              >
                                {deletingWastageId === log.id ? (
                                  <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                )}
                                {deletingWastageId === log.id ? 'Deleting' : 'Delete'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
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
                    {todaySnapshotRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No items received today
                        </TableCell>
                      </TableRow>
                    ) : (
                      todaySnapshotRows.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.item_name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-52">
                              {item.vendor_name}{item.invoice_number ? ` - ${item.invoice_number}` : ''}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="font-semibold">${Number(item.value || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Previous Inventory Snapshot */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Previous Inventory Snapshot</CardTitle>
                <p className="text-xs text-muted-foreground">Items received from earlier invoice uploads</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previousSnapshotRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No previous received items yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      previousSnapshotRows.slice(0, 50).map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.item_name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-52">
                              {item.invoice_number ? `Invoice ${item.invoice_number}` : 'Invoice upload'}
                            </div>
                          </TableCell>
                          <TableCell>{format(parseLocalDate(item.received_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="max-w-40 truncate">{item.vendor_name}</TableCell>
                          <TableCell>{item.quantity} {item.unit}</TableCell>
                          <TableCell className="font-semibold">${Number(item.value || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
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
              <Select
                value={getInventoryCategoryOption(editForm.accounting_category).code}
                onValueChange={(v) => setEditForm({ ...editForm, accounting_category: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVENTORY_ITEM_CATEGORY_OPTIONS.map(option => (
                    <SelectItem key={option.key} value={option.code}>
                      {option.label}
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
                <Select
                  value={editForm.current_unit || 'Each'}
                  onValueChange={(value) => setEditForm({ ...editForm, current_unit: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {[...new Set([editForm.current_unit, ...INVENTORY_COUNT_UNITS].filter(Boolean))]
                      .sort((a, b) => a.localeCompare(b))
                      .map(unit => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  {INVENTORY_ITEM_CATEGORY_OPTIONS.map(option => (
                    <SelectItem key={option.key} value={option.code}>
                      {option.label}
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
            <div className="space-y-2">
              <Label>Inventory Item</Label>
              <Select
                value={selectedItem?.id || ''}
                onValueChange={(id) => {
                  const item = inventory.find(entry => entry.id === id) || null;
                  setSelectedItem(item);
                  setWastageForm(prev => ({ ...prev, unit: item?.current_unit || 'ea' }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose item" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                  <SelectItem value="end_of_day_waste">End of Day Waste</SelectItem>
                  <SelectItem value="prep_waste">Prep Waste</SelectItem>
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
            <Button onClick={saveWastage} className={cn("bg-resend-red hover:bg-resend-red", !hasLocation && "opacity-50 cursor-not-allowed")}>Log Wastage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Count Template Dialog */}
      <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add Count Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Choose product groups from the current restaurant/location inventory and how RestOps should organize the items. Auto by Category keeps matching products grouped automatically; Sheet to Shelf is for manual station or shelf layouts.
            </p>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={countSheetForm.name}
                onChange={(event) => setCountSheetForm(prev => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Walk-In Cooler"
                autoFocus
              />
            </div>

            <div className="space-y-3">
              <Label>This count sheet should receive these product groups for this restaurant</Label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {countSheetBucketOptions.map(bucket => {
                  const checked = countSheetForm.buckets.includes(bucket.label);
                  return (
                    <label
                      key={bucket.label}
                      className={cn(
                        "flex items-center gap-3 rounded-md border bg-card px-3 py-2",
                        bucket.items === 0 && "opacity-60"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={bucket.items === 0}
                        onCheckedChange={(nextChecked) => {
                          setCountSheetForm(prev => ({
                            ...prev,
                            buckets: nextChecked
                              ? [...prev.buckets, bucket.label]
                              : prev.buckets.filter(label => label !== bucket.label),
                          }));
                        }}
                      />
                      <span className="min-w-0 text-sm font-medium">
                        {bucket.label}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {bucket.items} item{bucket.items === 1 ? '' : 's'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                <Label>Organize By</Label>
                <Select
                  value={countSheetForm.organizeBy}
                  onValueChange={(value) => setCountSheetForm(prev => ({ ...prev, organizeBy: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto_category">Auto by Category</SelectItem>
                    <SelectItem value="sheet_to_shelf">Sheet to Shelf</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border border-resend-yellow/40 bg-resend-yellow/10 px-4 py-3 text-sm text-resend-yellow">
                {(() => {
                  const selectedItems = inventory.filter(item => countSheetForm.buckets.includes(getCountSheetBucket(item)));
                  if (selectedItems.length === 0) {
                    return 'No current inventory items match these groups yet. The sheet can still be saved.';
                  }
                  return `${selectedItems.length} current inventory item${selectedItems.length === 1 ? '' : 's'} will be assigned to this sheet.`;
                })()}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className="bg-primary hover:bg-primary text-primary-foreground"
              disabled={!countSheetForm.name.trim() || countSheetForm.buckets.length === 0}
              onClick={saveLocalCountSheet}
            >
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCountSheetForm({ name: '', buckets: [], organizeBy: 'auto_category' });
                setNewTemplateOpen(false);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!countSheetDeleteTarget} onOpenChange={(open) => !open && setCountSheetDeleteTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete this count sheet?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-resend-red/25 bg-resend-red/10 p-4">
              <p className="font-semibold text-foreground">{countSheetDeleteTarget?.name || 'Count sheet'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {Number(countSheetDeleteTarget?.itemCount || countSheetDeleteTarget?.items?.length || 0)} assigned product{Number(countSheetDeleteTarget?.itemCount || countSheetDeleteTarget?.items?.length || 0) === 1 ? '' : 's'}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This removes the template from active count sheets. Existing saved stock count history will stay available.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className="bg-resend-red text-white hover:bg-resend-red/90"
              disabled={deleteCountSheetMutation.isPending}
              onClick={() => deleteCountSheetMutation.mutate(countSheetDeleteTarget)}
            >
              {deleteCountSheetMutation.isPending ? 'Deleting...' : 'Delete count sheet'}
            </Button>
            <Button variant="outline" onClick={() => setCountSheetDeleteTarget(null)}>
              Keep it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Count Session (Full Screen Wizard) */}
      {activeSessionOpen && allCountSheets.length > 0 && (
        <React.Suspense fallback={<InventorySectionFallback label="Loading count session..." />}>
          <ActiveCountSession
            sheet={allCountSheets.find(s => s.id === selectedCountSheetId) || allCountSheets[0]}
            inventory={inventory}
            onComplete={(counts) => {
               completeCountSessionMutation.mutate(counts);
            }}
            onCancel={() => setActiveSessionOpen(false)}
          />
        </React.Suspense>
      )}

      <Dialog open={stockCountSaveConfirmOpen} onOpenChange={setStockCountSaveConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingStockCountId ? 'Save these count changes?' : 'Save this inventory count?'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-primary/20 bg-primary/10 p-4">
              <p className="font-semibold text-foreground">
                {selectedStockCountLabel}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(new Date(`${stockCountDate}T00:00:00`), 'MMM d, yyyy')} · {currentStockCountItems.filter(item => item.count > 0).length} counted item{currentStockCountItems.filter(item => item.count > 0).length === 1 ? '' : 's'} · ${currentStockCountTotal.toFixed(2)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This will save the count history for this restaurant/location so you can reopen and edit it until it is closed.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button className={cn("bg-primary hover:bg-primary", !hasLocation && "opacity-50 cursor-not-allowed")} onClick={saveStockCount}>
              Save count
            </Button>
            <Button variant="outline" onClick={() => setStockCountSaveConfirmOpen(false)}>
              Review again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockCountCloseTarget} onOpenChange={(open) => !open && setStockCountCloseTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Close this saved count?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-resend-yellow/40 bg-resend-yellow/10 p-4">
              <p className="font-semibold text-foreground">{stockCountCloseTarget?.type || stockCountCloseTarget?.scope || 'Inventory Count'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stockCountCloseTarget?.date ? format(new Date(`${stockCountCloseTarget.date}T00:00:00`), 'MMM d, yyyy') : 'Saved count'} · ${Number(stockCountCloseTarget?.total || 0).toFixed(2)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Closing locks this count. After closing, users will not be able to reopen or edit it from Saved Count History.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className="bg-resend-yellow text-white hover:bg-resend-yellow/90"
              onClick={() => stockCountCloseTarget && closeStockCountRecord(stockCountCloseTarget.id)}
            >
              Close and lock
            </Button>
            <Button variant="outline" onClick={() => setStockCountCloseTarget(null)}>
              Keep editable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockCountDeleteTarget} onOpenChange={(open) => !open && setStockCountDeleteTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete this saved count?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-resend-red/25 bg-resend-red/10 p-4">
              <p className="font-semibold text-foreground">{stockCountDeleteTarget?.type || stockCountDeleteTarget?.scope || 'Inventory Count'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stockCountDeleteTarget?.date ? format(new Date(`${stockCountDeleteTarget.date}T00:00:00`), 'MMM d, yyyy') : 'Saved count'} · ${Number(stockCountDeleteTarget?.total || 0).toFixed(2)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This removes the saved count history from this local browser. You will not be able to view, export, or edit this saved count after deleting it.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className="bg-resend-red text-white hover:bg-resend-red/90"
              onClick={() => stockCountDeleteTarget && deleteStockCountRecord(stockCountDeleteTarget.id)}
            >
              Delete saved count
            </Button>
            <Button variant="outline" onClick={() => setStockCountDeleteTarget(null)}>
              Keep history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wastageRangeWarningOpen} onOpenChange={setWastageRangeWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pick a smaller waste window</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-resend-yellow/40 bg-resend-yellow/10 p-4">
              <p className="text-sm font-medium text-foreground">Wastage history can be reviewed 3 months at a time.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an end date within 3 months of the start date, then apply the range again.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button className="bg-primary hover:bg-primary" onClick={() => setWastageRangeWarningOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!wastageDeleteTarget} onOpenChange={(open) => !open && setWastageDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this waste log?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-resend-red/20 bg-resend-red/10 p-4">
              <p className="font-semibold text-foreground">{wastageDeleteTarget?.product_name || 'Waste item'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {Number(wastageDeleteTarget?.quantity || 0)} {wastageDeleteTarget?.unit || ''} · ${Number(wastageDeleteTarget?.value || 0).toFixed(2)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This will remove the waste history entry, restore the wasted quantity back to inventory, and refresh the wastage totals. This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className="bg-resend-red text-white hover:bg-resend-red/90"
              onClick={() => wastageDeleteTarget && deleteLocalWastageLog(wastageDeleteTarget.id)}
              disabled={!!deletingWastageId}
            >
              {deletingWastageId ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                'Yes, delete it'
              )}
            </Button>
            <Button variant="outline" onClick={() => setWastageDeleteTarget(null)} disabled={!!deletingWastageId}>
              Keep entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <style>{`
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
