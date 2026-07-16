import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery, useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/hooks/useConfirm';
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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getFlattenedCOA, getCOALabel } from '@/lib/accountingConfig';

function ProductsScrollableTable({ children, className = '' }) {
  return (
    <div className="relative max-h-[calc(100vh-330px)] min-h-[280px] w-full overflow-auto border-t border-border [scrollbar-color:hsl(var(--muted-foreground))_hsl(var(--muted))] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-corner]:bg-muted [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/60 [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-background [&_thead]:shadow-[0_1px_0_hsl(var(--border))]">
      <table className={`w-full caption-bottom text-sm ${className}`}>
        {children}
      </table>
    </div>
  );
}

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

const getScopedId = (entity) => entity?.id || entity?.brand_id || entity?.organization_id || null;

const getReportDateRange = (period) => {
  if (!period || period === 'all') return { startDate: null, endDate: null };
  const end = new Date();
  const start = new Date(end);
  const weekStart = (date) => {
    const result = new Date(date);
    result.setDate(date.getDate() - date.getDay());
    return result;
  };
  const quarterStartMonth = Math.floor(end.getMonth() / 3) * 3;
  if (period === 'month') {
    const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
    const monthEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    return {
      startDate: toReportDateString(monthStart),
      endDate: toReportDateString(monthEnd),
    };
  }
  if (period === 'week') {
    const first = weekStart(end);
    const last = new Date(first);
    last.setDate(first.getDate() + 6);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === 'last_week') {
    const first = weekStart(end);
    first.setDate(first.getDate() - 7);
    const last = new Date(first);
    last.setDate(first.getDate() + 6);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === 'quarter') {
    const first = new Date(end.getFullYear(), quarterStartMonth, 1);
    const last = new Date(end.getFullYear(), quarterStartMonth + 3, 0);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === 'last_period') {
    const first = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 0);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === 'last_quarter') {
    const first = new Date(end.getFullYear(), quarterStartMonth - 3, 1);
    const last = new Date(end.getFullYear(), quarterStartMonth, 0);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === 'this_year' || period === 'year') {
    const first = new Date(end.getFullYear(), 0, 1);
    const last = new Date(end.getFullYear(), 11, 31);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === 'last_year') {
    const first = new Date(end.getFullYear() - 1, 0, 1);
    const last = new Date(end.getFullYear() - 1, 11, 31);
    return { startDate: toReportDateString(first), endDate: toReportDateString(last) };
  }
  if (period === '30') start.setDate(end.getDate() - 30);
  if (period === '90') start.setDate(end.getDate() - 90);
  return {
    startDate: toReportDateString(start),
    endDate: toReportDateString(end),
  };
};

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const formatShortDate = (value) => value ? new Date(value).toLocaleDateString('en-US') : '-';
const CATEGORY_TYPE_OPTIONS = ['Food', 'Beer', 'Wine', 'Liquor', 'N/A Bev', 'Retail', 'Other'];

const getProductAccountingCode = (product) => {
  const value = product?.accounting_category || '';
  return /^\d{3,}/.test(value) ? value : getCOALabel(value);
};

const getProductCategoryType = (product) => {
  const accounting = String(product?.accounting_category || '').toLowerCase();
  const category = String(product?.category || '').toLowerCase();
  const name = String(product?.name || product?.product_name || '').toLowerCase();
  const text = `${accounting} ${category} ${name}`;
  if (/(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer|blue moon|modelo|corona|budweiser|bud light|coors|miller|heineken)/.test(text)) return 'Beer';
  if (/(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel|rose\b|rosé)/.test(text)) return 'Wine';
  if (/(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur|triple sec)/.test(text)) return 'Liquor';
  if (/(n\/a bev|na beverage|non[- ]?alcohol|beverage|soda|juice|tea|coffee|lemonade|energy drink|water|syrup, fontn|fountain|bib)/.test(text) || accounting.startsWith('52')) return 'N/A Bev';
  if (/(retail|merchandise|gift card|giftcard|apparel|shirt|hat|merch)/.test(text)) return 'Retail';
  if (accounting.startsWith('51') || accounting.includes('food') || category.includes('dairy') || category.includes('produce') || category.includes('poultry') || category.includes('grocery')) return 'Food';
  return 'Other';
};

const getProductItemCount = (product) => Number(product?.item_count || product?.vendor_item_count || 1);

const suggestProductFields = (name) => {
  const text = String(name || '').toLowerCase();
  if (/(paper|napkin|towel|cup|lid|straw|foil|wrap|bag|container|box|plate|packaging)/.test(text)) {
    return { category: 'Paper and Packaging', accounting_category: '5110' };
  }
  if (/(cleaner|cleaning|soap|detergent|sanitizer|bleach|sponge|scrubber)/.test(text)) {
    return { category: 'Cleaning Supplies', accounting_category: '5110' };
  }
  if (/(glove|apron|scraper|blade|pan|utensil|equipment|smallware|thermometer)/.test(text)) {
    return { category: 'Restaurant Supplies', accounting_category: '5110' };
  }
  if (/(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer)/.test(text)) {
    return { category: 'Beer', accounting_category: '5230' };
  }
  if (/(wine|prosecco|chardonnay|cabernet|merlot|pinot|sauvignon|champagne)/.test(text)) {
    return { category: 'Wine', accounting_category: '5240' };
  }
  if (/(vodka|gin|rum|tequila|whiskey|bourbon|scotch|liquor|liqueur)/.test(text)) {
    return { category: 'Liquor', accounting_category: '5220' };
  }
  if (/(soda|juice|tea|coffee|water|beverage|lemonade)/.test(text)) {
    return { category: 'N/A Beverage', accounting_category: '5210' };
  }
  if (/(lettuce|tomato|onion|potato|pepper|avocado|lime|lemon|produce|herb|cilantro)/.test(text)) {
    return { category: 'Produce', accounting_category: '5150' };
  }
  if (/(milk|cheese|cream|butter|egg|yogurt|dairy)/.test(text)) {
    return { category: 'Dairy', accounting_category: '5140' };
  }
  if (/(chicken|turkey|poultry)/.test(text)) {
    return { category: 'Poultry', accounting_category: '5120' };
  }
  if (/(fish|shrimp|salmon|tuna|crab|seafood)/.test(text)) {
    return { category: 'Seafood', accounting_category: '5130' };
  }
  if (/(beef|pork|bacon|sausage|steak|meat)/.test(text)) {
    return { category: 'Meat', accounting_category: '5110' };
  }
  if (/(bread|bun|roll|tortilla|bakery|cake|pastry)/.test(text)) {
    return { category: 'Bakery', accounting_category: '5110' };
  }
  return { category: 'Uncategorized', accounting_category: '5110' };
};

const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCsv = (filename, headers, rows) => {
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const parseReportDate = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const toReportDateString = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currentMonthRange = getReportDateRange('month');

const formatReportDateRange = (startDate, endDate) => {
  const start = parseReportDate(startDate);
  const end = parseReportDate(endDate);
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
  if (!start && !end) return 'All time';
  if (start && !end) return `${formatter.format(start)} -`;
  if (!start && end) return `- ${formatter.format(end)}`;
  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

const isSameDate = (left, right) =>
  !!left && !!right &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isBetweenDates = (date, start, end) => {
  if (!date || !start || !end) return false;
  const value = date.setHours(0, 0, 0, 0);
  const low = start.setHours(0, 0, 0, 0);
  const high = end.setHours(0, 0, 0, 0);
  return value >= low && value <= high;
};

const getCalendarWeeks = (monthDate) => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const days = [];
  for (let i = 0; i < first.getDay(); i += 1) days.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
};

function PurchaseReportDatePicker({
  startDate,
  endDate,
  onChange,
  onPreset,
  onClear,
}) {
  const initial = parseReportDate(startDate) || new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [pendingStart, setPendingStart] = useState(null);
  const selectedStart = pendingStart || parseReportDate(startDate);
  const selectedEnd = parseReportDate(endDate);
  const secondMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const handleDayClick = (date) => {
    if (!date) return;
    if (!pendingStart && (!selectedStart || selectedEnd)) {
      setPendingStart(date);
      onChange(toReportDateString(date), '');
      return;
    }

    const start = pendingStart || selectedStart || date;
    const orderedStart = date < start ? date : start;
    const orderedEnd = date < start ? start : date;
    setPendingStart(null);
    onChange(toReportDateString(orderedStart), toReportDateString(orderedEnd));
  };

  const renderMonth = (monthDate) => (
    <div className="w-[182px] shrink-0">
      <h3 className="mb-1.5 text-center text-sm font-semibold tracking-normal text-foreground">
        {monthFormatter.format(monthDate)}
      </h3>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
        {weekDays.map(day => <div key={day}>{day}</div>)}
      </div>
      <div className="grid grid-cols-7 overflow-hidden border-l border-t">
        {getCalendarWeeks(monthDate).map((day, index) => {
          const inRange = isBetweenDates(
            day ? new Date(day) : null,
            selectedStart ? new Date(selectedStart) : null,
            selectedEnd ? new Date(selectedEnd) : null
          );
          const isStart = isSameDate(day, selectedStart);
          const isEnd = isSameDate(day, selectedEnd);
          const isSelected = isStart || isEnd;
          return (
            <button
              key={`${monthDate.toISOString()}-${index}`}
              type="button"
              disabled={!day}
              onClick={() => handleDayClick(day)}
              className={[
                'h-[25px] border-b border-r text-xs transition-colors',
                !day ? 'bg-background text-transparent' : 'hover:bg-primary/10',
                inRange ? 'bg-primary/25 text-foreground' : 'bg-background',
                isSelected ? 'bg-primary text-primary-foreground hover:bg-primary' : '',
              ].join(' ')}
            >
              {day ? day.getDate() : ''}
            </button>
          );
        })}
      </div>
    </div>
  );

  const presetButtons = [
    ['This Week', 'week'],
    ['This Period', 'month'],
    ['This Year', 'this_year'],
    ['This Quarter', 'quarter'],
    ['Last Week', 'last_week'],
    ['Last Period', 'last_period'],
    ['Last Year', 'last_year'],
    ['Last Quarter', 'last_quarter'],
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-full justify-start gap-2 border-border bg-background px-3 text-sm font-semibold text-foreground sm:w-[300px] lg:w-[320px]"
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          <span>{formatReportDateRange(startDate, endDate)}</span>
          <X
            className="ml-auto h-4 w-4 text-primary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPendingStart(null);
              onClear();
            }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-50 max-h-[calc(100vh-120px)] w-[min(520px,calc(100vw-2rem))] overflow-auto p-3 shadow-xl">
        <div className="mb-1.5 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex w-max gap-4">
          {renderMonth(visibleMonth)}
          {renderMonth(secondMonth)}
        </div>
        <div className="mx-auto mt-2 grid max-w-[440px] grid-cols-2 gap-1.5 sm:grid-cols-4">
          {presetButtons.map(([label, value]) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              className="h-7 border-primary px-2 text-xs font-semibold text-primary hover:bg-primary/10"
              onClick={() => {
                setPendingStart(null);
                onPreset(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const pathParts = routerLocation.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const activeTab = currentSubPath || 'all-products';

  const setActiveTab = (tab) => {
    navigate(`/Products/${tab}${routerLocation.search}`);
  };
  const { isGroundStaff, isBranchManagerOrAbove, isOrgManagerOrAbove } = usePermissions();
  const { confirm, ConfirmDialog } = useConfirm();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [sortBy, setSortBy] = useState('name');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productCategoryTypeFilter, setProductCategoryTypeFilter] = useState('all');
  const [reportPeriod, setReportPeriod] = useState('month');
  const [reportStartDate, setReportStartDate] = useState(currentMonthRange.startDate);
  const [reportEndDate, setReportEndDate] = useState(currentMonthRange.endDate);
  const [reportCategoryType, setReportCategoryType] = useState('all');
  const [reportCategory, setReportCategory] = useState('all');
  const [reportSortBy, setReportSortBy] = useState('product_name');
  const [verificationStatus, setVerificationStatus] = useState('all');
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
    if (!(await confirm({
      title: 'Delete selected products?',
      description: `This will delete ${selectedIds.size} product(s). This cannot be undone.`,
    }))) return;
    try {
      await Promise.all([...selectedIds].map(id => api.products.deleteProduct(id)));
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} product(s) deleted`);
    } catch (error) {
      toast.error(error?.message || 'Failed to delete products');
    }
  };

  const handleBulkExport = () => {
    const selected = products.filter(p => selectedIds.has(p.id));
    const headers = ['Product ID', 'Name', 'Category Type', 'Category', 'Accounting Code', 'Item Count', 'On Inventory', 'Tax Exempt', 'Report By Unit', 'Latest Price', 'Last Purchased'];
    const rows = selected.map(p => [
      p.product_id,
      p.name,
      getProductCategoryType(p),
      p.category,
      getProductAccountingCode(p),
      getProductItemCount(p),
      p.is_inventoried ? 'Yes' : 'No',
      p.is_tax_exempt ? 'Yes' : 'No',
      p.report_by_unit,
      p.latest_price,
      p.last_purchased_at
    ]);
    downloadCsv('products_selected.csv', headers, rows);
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
    vendor_id: '',
    vendor_quantity: '',
  });

  const queryClient = useQueryClient();
  const { organization, brand, location } = useAuth();
  const organizationId = getScopedId(organization);
  const brandId = getScopedId(brand);
  const locationId = getScopedId(location);
  const reportDateRange = React.useMemo(() => ({
    startDate: reportStartDate || null,
    endDate: reportEndDate || null,
  }), [reportStartDate, reportEndDate]);

  const {
    data = {},
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useAuthInfiniteQuery({
    queryKey: ['products', organizationId, brandId, locationId, debouncedSearch, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      return await api.products.getCatalog({
        organizationId,
        brandId,
        locationId,
        search: debouncedSearch || null,
        sortBy,
        page: pageParam,
        pageSize: 50,
      });
    },
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organizationId,
  });

  const products = React.useMemo(() => data.pages ? data.pages.flat() : [], [data.pages]);

  const { data: productSummary = {}, isLoading: loadingSummary } = useAuthQuery({
    queryKey: ['product_dashboard_summary', organizationId, brandId, locationId],
    queryFn: () => api.products.getDashboardSummary({
      organizationId,
      brandId,
      locationId
    }),
    enabled: !!organizationId,
  });

  const { data: purchaseReport = [], isLoading: loadingPurchaseReport } = useAuthQuery({
    queryKey: ['product_purchase_report', organizationId, brandId, locationId, reportStartDate, reportEndDate, reportCategoryType, reportCategory, debouncedSearch],
    queryFn: () => api.products.getPurchaseReport({
      organizationId,
      brandId,
      locationId,
      startDate: reportDateRange.startDate,
      endDate: reportDateRange.endDate,
      categoryType: reportCategoryType,
      category: reportCategory,
      search: debouncedSearch || null,
    }),
    enabled: !!organizationId && activeTab === 'purchase-report',
  });

  const { data: verificationQueue = [], isLoading: loadingVerificationQueue } = useAuthQuery({
    queryKey: ['product_verification_queue', organizationId, brandId, locationId, verificationStatus, debouncedSearch],
    queryFn: () => api.products.getVerificationQueue({
      organizationId,
      brandId,
      locationId,
      status: verificationStatus,
      search: debouncedSearch || null,
    }),
    enabled: !!organizationId && activeTab === 'ai-verification',
  });

  const { data: priceVariances = [], isLoading: loadingVariances } = useAuthQuery({
    queryKey: ['price_variances', organizationId],
    queryFn: () => api.vendors.getFlaggedVendorItems(organizationId),
    enabled: !!organizationId && (activeTab === 'price-variances' || activeTab === 'all-products'),
  });

  const { data: vendorsForProductForm = [] } = useAuthQuery({
    queryKey: ['vendors-for-product-form', organizationId],
    queryFn: () => api.entities.Vendor.filter({ organization_id: organizationId }, { orderBy: 'name' }),
    enabled: !!organizationId && dialogOpen,
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

  const categorizeProductsMutation = useMutation({
    mutationFn: () => api.products.categorizeProducts({
      organizationId,
      brandId,
      locationId,
      limit: 25,
      autoApply: true,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['product_purchase_report'] });
      queryClient.invalidateQueries({ queryKey: ['product_verification_queue'] });
      toast.success(`AI categorized ${result?.applied || 0} products and queued ${Math.max((result?.updated || 0) - (result?.applied || 0), 0)} for review`);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to categorize products');
    },
  });

  const applyCategorySuggestionMutation = useMutation({
    mutationFn: (productId) => api.products.applyCategorySuggestion(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['product_purchase_report'] });
      queryClient.invalidateQueries({ queryKey: ['product_verification_queue'] });
      toast.success('Category suggestion approved');
    },
    onError: () => toast.error('Failed to approve category suggestion'),
  });

  const rejectCategorySuggestionMutation = useMutation({
    mutationFn: (productId) => api.products.rejectCategorySuggestion(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_verification_queue'] });
      toast.success('Category suggestion rejected');
    },
    onError: () => toast.error('Failed to reject category suggestion'),
  });

  useEffect(() => {
    const channel = supabase.channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
        queryClient.invalidateQueries({ queryKey: ['product_purchase_report'] });
        queryClient.invalidateQueries({ queryKey: ['product_verification_queue'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const product = await api.products.createProductDetails(data, {
        organizationId,
        brandId,
        locationId,
      });

      // Capture quantity from vendor at onboarding time, if given, as a vendor_items row
      // mapped to the new product -- same create-then-map pattern VendorItemsTab.jsx already
      // uses, just triggered from the product side instead of the vendor side.
      if (data.vendor_id && data.vendor_quantity) {
        const vendorItem = await api.entities.VendorItem.create({
          organization_id: organizationId,
          vendor_id: data.vendor_id,
          vendor_item_name: data.name,
          vendor_unit: data.vendor_quantity,
        });
        await api.entities.VendorItemMapping.create({
          organization_id: organizationId,
          vendor_item_id: vendorItem.id,
          internal_product_id: product.id,
          conversion_multiplier: 1,
          is_verified: true,
        });
      }

      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      toast.success('Product created');
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error?.message || 'Failed to create product'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.products.updateProductDetails(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['product_purchase_report'] });
      queryClient.invalidateQueries({ queryKey: ['product_verification_queue'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      toast.success('Product updated');
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error?.message || 'Failed to update product'),
  });

  const { data: requireLocationManagerApproval = false } = useAuthQuery({
    queryKey: ['product_approval_setting', organizationId],
    queryFn: () => api.products.getApprovalSetting(organizationId),
    enabled: !!organizationId && isOrgManagerOrAbove,
  });

  const approvalSettingMutation = useMutation({
    mutationFn: (enabled) => api.products.setApprovalSetting(organizationId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_approval_setting', organizationId] });
      toast.success('Product approval setting updated');
    },
    onError: (error) => toast.error(error?.message || 'Failed to update setting'),
  });

  const approveChangeMutation = useMutation({
    mutationFn: (productId) => api.products.approveChange(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product change approved');
    },
    onError: (error) => toast.error(error?.message || 'Failed to approve change'),
  });

  const rejectChangeMutation = useMutation({
    mutationFn: (productId) => api.products.rejectChange(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product change rejected');
    },
    onError: (error) => toast.error(error?.message || 'Failed to reject change'),
  });

  const inventoryTrackingMutation = useMutation({
    mutationFn: ({ productId, isInventoried }) => api.products.setInventoryTracking(productId, isInventoried),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      toast.success(variables.isInventoried ? 'Product added to inventory' : 'Product removed from inventory tracking');
    },
    onError: (error) => toast.error(error?.message || 'Failed to update inventory tracking'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.products.deleteProduct(id),
    onError: (error) => toast.error(error?.message || 'Failed to delete'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product_dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['product_purchase_report'] });
      queryClient.invalidateQueries({ queryKey: ['product_verification_queue'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics'] });
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
      vendor_id: '',
      vendor_quantity: '',
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

  const handleDelete = async (product) => {
    if (!product?.id) return;
    const label = product.product_id ? `${product.product_id} - ${product.name}` : product.name;
    if (!(await confirm({
      title: 'Delete product?',
      description: `Delete ${label}? This will remove it from active product lists.`,
    }))) return;
    deleteMutation.mutate(product.id);
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
    const normalizedFormData = {
      ...formData,
      name: String(formData.name || '').trim().toUpperCase(),
    };

    if (!normalizedFormData.name) {
      toast.error('Product name is required');
      return;
    }

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: normalizedFormData });
    } else {
      createMutation.mutate(normalizedFormData);
    }
  };

  const handleAutoFillProductFields = () => {
    const normalizedName = String(formData.name || '').trim().toUpperCase();
    if (!normalizedName) {
      toast.error('Enter a product name first');
      return;
    }

    const suggestion = suggestProductFields(normalizedName);
    setFormData({
      ...formData,
      name: normalizedName,
      category: suggestion.category,
      accounting_category: suggestion.accounting_category,
    });
    toast.success('Product fields auto-filled');
  };

  const exportToCSV = () => {
    const headers = ['Product ID', 'Name', 'Category Type', 'Category', 'Accounting Code', 'Item Count', 'On Inventory', 'Tax Exempt', 'Report By Unit', 'Latest Price', 'Last Purchased'];
    const rows = filteredProducts.map(p => [
      p.product_id,
      p.name,
      getProductCategoryType(p),
      p.category,
      getProductAccountingCode(p),
      getProductItemCount(p),
      p.is_inventoried ? 'Yes' : 'No',
      p.is_tax_exempt ? 'Yes' : 'No',
      p.report_by_unit,
      p.latest_price,
      p.last_purchased_at
    ]);
    downloadCsv('products.csv', headers, rows);
  };

  const exportPurchaseReport = () => {
    const headers = ['Restaurant', 'Product ID', 'Product', 'Category Type', 'Category', 'Report By', 'Invoice Count', 'Line Count', 'Purchased Units', 'Purchased Amount', 'Latest Cost', 'Avg Cost', 'Last Purchased'];
    const rows = purchaseReport.map(row => [
      row.restaurant,
      row.restops_product_id,
      row.product_name,
      row.category_type,
      row.category,
      row.report_by,
      row.invoice_count,
      row.line_count,
      row.purchased_units,
      row.purchased_amount,
      row.latest_cost,
      row.avg_cost,
      row.last_purchased_at
    ]);
    downloadCsv('product_purchase_report.csv', headers, rows);
  };

  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      const matchesCategoryType = productCategoryTypeFilter === 'all' || getProductCategoryType(p) === productCategoryTypeFilter;
      const matchesCategory = categoryFilter === 'all' || (p.category || 'Uncategorized') === categoryFilter;
      return matchesCategoryType && matchesCategory;
    });
  }, [products, categoryFilter, productCategoryTypeFilter]);

  const productCategoryOptions = React.useMemo(() => {
    const categories = new Set(products.map(product => product.category || 'Uncategorized'));
    return [...categories].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const { totalProducts, inventoriedCount, taxExemptCount, categoriesCount } = React.useMemo(() => {
    return {
      totalProducts: productSummary.total_products ?? products.length,
      inventoriedCount: productSummary.inventoried_count ?? products.filter(p => p.is_inventoried).length,
      taxExemptCount: productSummary.tax_exempt_count ?? products.filter(p => p.is_tax_exempt).length,
      categoriesCount: productSummary.category_count ?? new Set(products.map(p => p.accounting_category)).size
    };
  }, [productSummary, products]);

  const purchaseCategoryOptions = React.useMemo(() => {
    const categories = new Set(purchaseReport.map(row => row.category).filter(Boolean));
    return [...categories].sort((a, b) => a.localeCompare(b));
  }, [purchaseReport]);

  const purchaseReportTotals = React.useMemo(() => ({
    units: purchaseReport.reduce((sum, row) => sum + Number(row.purchased_units || 0), 0),
    amount: purchaseReport.reduce((sum, row) => sum + Number(row.purchased_amount || 0), 0),
  }), [purchaseReport]);

  const sortedPurchaseReport = React.useMemo(() => {
    const descending = reportSortBy.startsWith('-');
    const key = descending ? reportSortBy.slice(1) : reportSortBy;
    const numericKeys = new Set([
      'invoice_count',
      'line_count',
      'purchased_units',
      'purchased_amount',
      'latest_cost',
      'avg_cost',
    ]);

    return [...purchaseReport].sort((left, right) => {
      const leftValue = left[key];
      const rightValue = right[key];

      if (numericKeys.has(key)) {
        const result = Number(leftValue || 0) - Number(rightValue || 0);
        return descending ? -result : result;
      }

      const result = String(leftValue || '').localeCompare(String(rightValue || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return descending ? -result : result;
    });
  }, [purchaseReport, reportSortBy]);

  const renderProductSortHead = (label, key, className = '') => {
    const activeAsc = sortBy === key;
    const activeDesc = sortBy === `-${key}`;
    return (
      <TableHead className={`whitespace-nowrap px-4 py-3 ${className}`}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left font-semibold text-foreground hover:text-primary"
          onClick={() => setSortBy(activeAsc ? `-${key}` : key)}
        >
          <span>{label}</span>
          <span className={activeAsc || activeDesc ? 'text-primary' : 'text-muted-foreground'}>
            {activeAsc ? '↑' : activeDesc ? '↓' : '↕'}
          </span>
        </button>
      </TableHead>
    );
  };

  const renderReportSortHead = (label, key, className = '') => {
    const activeAsc = reportSortBy === key;
    const activeDesc = reportSortBy === `-${key}`;
    return (
      <TableHead className={`whitespace-normal px-4 py-3 ${className}`}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left font-semibold text-foreground hover:text-primary"
          onClick={() => setReportSortBy(activeAsc ? `-${key}` : key)}
        >
          <span>{label}</span>
          <span className={activeAsc || activeDesc ? 'text-primary' : 'text-muted-foreground'}>
            {activeAsc ? '↑' : activeDesc ? '↓' : '↕'}
          </span>
        </button>
      </TableHead>
    );
  };

  const handleReportPeriodChange = (period) => {
    setReportPeriod(period);
    const range = getReportDateRange(period);
    setReportStartDate(range.startDate || '');
    setReportEndDate(range.endDate || '');
  };

  const clearReportDateRange = () => {
    setReportPeriod('all');
    setReportStartDate('');
    setReportEndDate('');
  };

  const resetPurchaseReportFilters = () => {
    handleReportPeriodChange('month');
    setReportCategoryType('all');
    setReportCategory('all');
    setSearch('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your product catalog</p>
        </div>
        {!isGroundStaff && (
          <div className="flex items-center gap-4">
            {isOrgManagerOrAbove && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Require approval for location manager changes
                </Label>
                <Switch
                  checked={requireLocationManagerApproval}
                  onCheckedChange={(v) => approvalSettingMutation.mutate(v)}
                  disabled={approvalSettingMutation.isPending}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-primary hover:bg-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Products</p>
            <p className="text-2xl font-bold text-foreground">{loadingSummary ? '...' : totalProducts}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Inventoried</p>
            <p className="text-2xl font-bold text-foreground">{loadingSummary ? '...' : inventoriedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tax Exempt</p>
            <p className="text-2xl font-bold text-foreground">{loadingSummary ? '...' : taxExemptCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-foreground">{loadingSummary ? '...' : categoriesCount}</p>
          </CardContent>
        </Card>
      </div>
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
        <CardContent className="space-y-3 border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={productCategoryTypeFilter} onValueChange={setProductCategoryTypeFilter}>
              <SelectTrigger className="h-10 w-full bg-background sm:w-[210px]">
                <span className="text-xs uppercase text-muted-foreground">Category type</span>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {CATEGORY_TYPE_OPTIONS.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 w-full bg-background sm:w-[210px]">
                <span className="text-xs uppercase text-muted-foreground">Category</span>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {productCategoryOptions.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:ml-auto sm:w-[300px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 bg-background pl-9"
              />
            </div>
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
          <ProductsScrollableTable className="min-w-[1540px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] px-4 py-3">
                  {!isGroundStaff && (
                    <Checkbox
                      checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  )}
                </TableHead>
                {renderProductSortHead('Name', 'name', 'w-[250px]')}
                {renderProductSortHead('Category', 'category', 'w-[210px]')}
                {renderProductSortHead('Accounting Code', 'accounting_category', 'w-[170px]')}
                <TableHead className="w-[110px] whitespace-nowrap px-4 py-3 text-right">Item Count</TableHead>
                {renderProductSortHead('On Inventory', 'is_inventoried', 'w-[140px]')}
                {renderProductSortHead('Tax Exempt', 'is_tax_exempt', 'w-[130px]')}
                {renderProductSortHead('Report By Unit', 'report_by_unit', 'w-[170px]')}
                {renderProductSortHead('Latest Price', 'latest_price', 'w-[150px] text-right')}
                <TableHead className="w-[160px] whitespace-nowrap px-4 py-3 text-right">Last Purchased</TableHead>
                <TableHead className="w-[60px] px-4 py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id} className={selectedIds.has(product.id) ? "bg-primary/5" : ""}>
                    <TableCell className="px-4 py-3">
                      {!isGroundStaff && (
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleSelect(product.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{product.description || product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.product_id || 'No Product ID'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span>{product.category || 'Uncategorized'}</span>
                        {product.category_review_status === 'pending' && product.suggested_category && (
                          <span className="text-xs text-primary">
                            AI: {product.suggested_category}
                            {product.category_confidence ? ` (${Number(product.category_confidence).toFixed(0)}%)` : ''}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">{getProductAccountingCode(product) || '-'}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium">{formatNumber(getProductItemCount(product))}</TableCell>
                    <TableCell className="px-4 py-3">
                      <Select
                        value={product.is_inventoried ? 'yes' : 'no'}
                        onValueChange={(value) => inventoryTrackingMutation.mutate({
                          productId: product.id,
                          isInventoried: value === 'yes',
                        })}
                        disabled={isGroundStaff || inventoryTrackingMutation.isPending}
                      >
                        <SelectTrigger className="h-8 w-[92px] bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="px-4 py-3">{product.is_tax_exempt ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="px-4 py-3">{product.report_by_unit || 'Each'}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-semibold">{formatMoney(product.latest_price)}</TableCell>
                    <TableCell className="px-4 py-3 text-right">{formatShortDate(product.last_purchased_at)}</TableCell>
                    <TableCell className="px-4 py-3">
                      {!isGroundStaff && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Open actions for ${product.name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(product)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(product)}
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
                  <TableCell colSpan={11} className="text-center p-4">
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
          </ProductsScrollableTable>
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Total Items: {formatNumber(totalProducts)} {filteredProducts.length !== totalProducts ? `(Showing Items: ${formatNumber(filteredProducts.length)})` : ''}
          </div>
        </CardContent>
      </Card>

      {/* Legacy compact table hidden after MarginEdge-style replacement */}
      <Card className="hidden">
        <CardContent className="p-0">
          <div className="relative">
            <ProductsScrollableTable className="min-w-[1540px]">
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
                          {product.pending_approval && (
                            <Badge className="bg-amber-500/10 text-amber-600">
                              Pending {product.pending_action === 'delete' ? 'Deletion' : product.pending_action === 'create' ? 'Approval' : 'Change'}
                            </Badge>
                          )}
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
                              <Button variant="ghost" size="icon" aria-label={`Open actions for ${product.name}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {product.pending_approval && isBranchManagerOrAbove && (
                                <>
                                  <DropdownMenuItem onClick={() => approveChangeMutation.mutate(product.id)}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve Change
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => rejectChangeMutation.mutate(product.id)}
                                    className="text-resend-red"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" /> Reject Change
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem onClick={() => handleEdit(product)}>
                                <Edit2 className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(product)}
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
            </ProductsScrollableTable>
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
              <div className="flex items-center gap-2">
                {!isGroundStaff && (
                  <Button
                    size="sm"
                    onClick={() => categorizeProductsMutation.mutate()}
                    disabled={!organizationId || categorizeProductsMutation.isPending}
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    {categorizeProductsMutation.isPending ? 'Categorizing...' : 'Generate AI Categories'}
                  </Button>
                )}
                <Badge variant="outline" className="px-3 py-1">
                  {loadingVerificationQueue ? 'Loading' : `${verificationQueue.length} to review`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
                <Select value={verificationStatus} onValueChange={setVerificationStatus}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="unmapped">Unmapped</SelectItem>
                    <SelectItem value="suggested">Suggested</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search vendor or product"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <ProductsScrollableTable className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Last Purchased</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vendor Item</TableHead>
                    <TableHead>Suggested Product</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const newProducts = verificationQueue.map(item => ({
                      ...item,
                      id: item.internal_product_id || item.vendor_item_id,
                      name: item.vendor_item_name,
                      created_at: item.last_purchased_at,
                      accounting_category: item.category_type,
                    }));
                    return loadingVerificationQueue ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          Loading verification queue...
                        </TableCell>
                      </TableRow>
                    ) : newProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-resend-green opacity-50" />
                          No invoice/vendor items require manual review.
                        </TableCell>
                      </TableRow>
                    ) : (
                      newProducts.map((p, idx) => {
                        const confidence = Number(p.match_confidence || 0);
                        const isLowConfidence = confidence < 90;
                        const isProductCategoryReview = !p.vendor_item_id && Boolean(p.internal_product_id);

                        const globalMatch = null;
                        const globalCategory = null;

                        return (
                          <TableRow key={p.id} className={isLowConfidence ? "bg-resend-yellow/5" : ""}>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{p.vendor_name || '-'}</TableCell>
                            <TableCell className="font-medium text-foreground">
                              {p.vendor_item_name || p.name}
                              {p.vendor_item_code && (
                                <div className="text-xs text-muted-foreground">Vendor code: {p.vendor_item_code}</div>
                              )}
                              {isLowConfidence && <span className="ml-2 text-xs text-resend-yellow font-medium italic">Needs Verification</span>}
                            </TableCell>
                            <TableCell>
                              {p.product_name ? (
                                <div className="space-y-1">
                                  <Badge variant="outline" className="font-medium">{p.product_name}</Badge>
                                  {p.restops_product_id && (
                                    <div className="text-xs text-muted-foreground">{p.restops_product_id}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs italic text-muted-foreground">No product mapped</span>
                              )}
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
                                  {confidence.toFixed(0)}%
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant="secondary" className="w-fit">{p.category_type || 'Other'}</Badge>
                                <span className="text-xs text-muted-foreground">{p.category || 'Uncategorized'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {!isGroundStaff && (
                                <div className="flex gap-2">
                                  {isProductCategoryReview ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="default"
                                        className="h-7 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                                        onClick={() => applyCategorySuggestionMutation.mutate(p.internal_product_id)}
                                        disabled={applyCategorySuggestionMutation.isPending || rejectCategorySuggestionMutation.isPending}
                                      >
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => rejectCategorySuggestionMutation.mutate(p.internal_product_id)}
                                        disabled={applyCategorySuggestionMutation.isPending || rejectCategorySuggestionMutation.isPending}
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  ) : (
                                    <Button size="sm" variant="default" className="text-xs h-7 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                                      if (!p.internal_product_id) {
                                        toast.info('Mapping editor will be added in the next phase.');
                                        return;
                                      }
                                      const product = products.find(item => item.id === p.internal_product_id);
                                      if (product) handleEdit(product);
                                    }}>
                                      Review
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
              </ProductsScrollableTable>
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
              <ProductsScrollableTable className="min-w-[1280px]">
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
              </ProductsScrollableTable>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase Report Tab */}
        <TabsContent value="purchase-report">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-col gap-3 border-b bg-background px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold tracking-normal">Purchase Report</CardTitle>
                <p className="text-sm text-muted-foreground">Approved invoice purchases by product</p>
              </div>
              {!isGroundStaff && (
                <Button variant="outline" size="sm" onClick={exportPurchaseReport} disabled={purchaseReport.length === 0}>
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-3 border-b bg-muted/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PurchaseReportDatePicker
                    startDate={reportStartDate}
                    endDate={reportEndDate}
                    onChange={(start, end) => {
                      setReportStartDate(start);
                      setReportEndDate(end);
                      setReportPeriod('custom');
                    }}
                    onPreset={handleReportPeriodChange}
                    onClear={clearReportDateRange}
                  />
                  <Select value={reportCategoryType} onValueChange={setReportCategoryType}>
                    <SelectTrigger className="h-10 w-full bg-background sm:w-[240px]">
                      <span className="text-xs uppercase text-muted-foreground">View by:</span>
                      <SelectValue placeholder="Category Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Category Types</SelectItem>
                      {CATEGORY_TYPE_OPTIONS.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={reportCategory} onValueChange={setReportCategory}>
                    <SelectTrigger className="h-10 w-full bg-background sm:w-[230px]">
                      <span className="text-xs uppercase text-muted-foreground">View by:</span>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {purchaseCategoryOptions.map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={reportPeriod} onValueChange={handleReportPeriodChange}>
                    <SelectTrigger className="h-10 w-full bg-background sm:w-[160px]">
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">This month</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                      <SelectItem value="year">Last year</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex h-10 w-full items-center gap-3 rounded-md border border-input bg-background px-3 text-sm sm:w-[210px]">
                    <span className="text-xs uppercase text-muted-foreground">Report on</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                      {location?.name || '1 Store'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 bg-background"
                    aria-label="Clear purchase report filters"
                    onClick={resetPurchaseReportFilters}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-8 rounded-md bg-background px-3">
                      {purchaseReport.length} products
                    </Badge>
                    <Badge variant="outline" className="h-8 rounded-md bg-background px-3">
                      Total purchased: {formatMoney(purchaseReportTotals.amount)}
                    </Badge>
                  </div>
                  <div className="relative w-full lg:w-[300px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search products"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 bg-background pl-9"
                    />
                  </div>
                </div>
              </div>
              <div className="relative">
                <ProductsScrollableTable className="min-w-[1960px] table-fixed">
                  <TableHeader>
                    <TableRow className="bg-background">
                      {renderReportSortHead('Restaurant', 'restaurant', 'w-[150px]')}
                      {renderReportSortHead('Product ID', 'restops_product_id', 'w-[140px]')}
                      {renderReportSortHead('Product', 'product_name', 'w-[240px]')}
                      {renderReportSortHead('Category Type', 'category_type', 'w-[150px]')}
                      {renderReportSortHead('Category', 'category', 'w-[220px]')}
                      {renderReportSortHead('Report By', 'report_by', 'w-[170px]')}
                      {renderReportSortHead('Invoices', 'invoice_count', 'w-[110px] text-right')}
                      {renderReportSortHead('Lines', 'line_count', 'w-[90px] text-right')}
                      {renderReportSortHead('Purchased Units', 'purchased_units', 'w-[150px] text-right')}
                      {renderReportSortHead('Purchased Amount', 'purchased_amount', 'w-[170px] text-right')}
                      {renderReportSortHead('Latest Cost', 'latest_cost', 'w-[130px] text-right')}
                      {renderReportSortHead('Avg Cost', 'avg_cost', 'w-[130px] text-right')}
                      {renderReportSortHead('Last Purchased', 'last_purchased_at', 'w-[150px]')}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {loadingPurchaseReport ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-10 text-muted-foreground">
                        Loading purchase report...
                      </TableCell>
                    </TableRow>
                  ) : purchaseReport.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-14 text-center">
                        <div className="mx-auto max-w-xl space-y-2">
                          <Package className="mx-auto h-9 w-9 text-muted-foreground/40" />
                          <p className="text-base font-medium text-foreground">No approved invoice purchases found</p>
                          <p className="text-sm text-muted-foreground">
                            Purchase Report is built from approved invoices and invoice line items. This store currently has products in the catalog, but no approved invoice purchase lines for the selected date range.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedPurchaseReport.map(row => (
                      <TableRow key={`${row.product_id || row.product_name}-${row.restaurant}-${row.report_by}`} className="align-top">
                        <TableCell className="px-4 py-3 text-sm">{row.restaurant || 'Current Store'}</TableCell>
                        <TableCell className="px-4 py-3 font-mono text-sm">{row.restops_product_id || '-'}</TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{row.product_name}</p>
                            <p className="hidden">
                              {row.restops_product_id || 'No Product ID'} • {formatNumber(row.invoice_count)} invoices • {formatNumber(row.line_count)} lines
                            </p>
                            <p className="hidden">
                              Latest {formatMoney(row.latest_cost)} • Avg {formatMoney(row.avg_cost)} • Last {formatDate(row.last_purchased_at)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="secondary">{row.category_type || 'Other'}</Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">{row.category || 'Uncategorized'}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{row.report_by || '-'}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium">{formatNumber(row.invoice_count)}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium">{formatNumber(row.line_count)}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium">{formatNumber(row.purchased_units)}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-semibold">{formatMoney(row.purchased_amount)}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium">{formatMoney(row.latest_cost)}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium">{formatMoney(row.avg_cost)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">{formatDate(row.last_purchased_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {!loadingPurchaseReport && purchaseReport.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={8} className="px-4 py-3 text-right">Total</TableCell>
                      <TableCell className="px-4 py-3 text-right">{formatNumber(purchaseReportTotals.units)}</TableCell>
                      <TableCell className="px-4 py-3 text-right">{formatMoney(purchaseReportTotals.amount)}</TableCell>
                      <TableCell className="px-4 py-3" />
                      <TableCell className="px-4 py-3" />
                      <TableCell className="px-4 py-3" />
                    </TableRow>
                  )}
                  </TableBody>
                </ProductsScrollableTable>
              </div>
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
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
                   <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={handleAutoFillProductFields}>
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

            {!editingProduct && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vendor (optional)</Label>
                  <Select
                    value={formData.vendor_id}
                    onValueChange={(v) => setFormData({ ...formData, vendor_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorsForProductForm.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity from Vendor</Label>
                  <Input
                    placeholder="e.g. 10lb Case"
                    value={formData.vendor_quantity}
                    onChange={(e) => setFormData({ ...formData, vendor_quantity: e.target.value })}
                    disabled={!formData.vendor_id}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              className="bg-primary hover:bg-primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : createMutation.isPending ? 'Creating...' : `${editingProduct ? 'Update' : 'Create'} Product`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
