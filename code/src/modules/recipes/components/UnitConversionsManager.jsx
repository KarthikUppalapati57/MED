import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Loader2, Pencil, Plus, Search, ToggleLeft, Trash2 } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirmation } from '@/hooks/useConfirmation';
import { formatConversionRule, normalizeRecipeUnit } from '@/modules/recipes/lib/recipeUnits';
import {
  loadConversionCatalogProducts,
  mergeConversionProducts,
  resolveConversionProductName,
} from '@/modules/recipes/lib/conversionProducts';
import UnitConversionDialog from '@/modules/recipes/components/UnitConversionDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

export { buildMissingConversionDefaults } from '@/modules/recipes/lib/recipeUnits';

export default function UnitConversionsManager({
  products: productsProp,
  conversions: conversionsProp,
  initialProductId = null,
  initialDialogDefaults = null,
  returnTo = '',
  compact = false,
}) {
  const { organization, brand, location } = useAuth();
  const { canManageRecipes } = usePermissions();
  const { confirm } = useConfirmation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState(initialProductId ? 'product' : 'all');
  const [productFilter, setProductFilter] = useState(initialProductId || 'all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState(null);

  const organizationId = organization?.id || null;
  const brandId = brand?.brand_id || brand?.id || null;
  const locationId = location?.id || null;

  const {
    data: loadedProducts = [],
    isLoading: loadingProducts,
    isError: productsError,
    error: productsErrorDetail,
  } = useAuthQuery({
    queryKey: ['conversion-catalog-products', organizationId, brandId, locationId],
    queryFn: () => loadConversionCatalogProducts(organizationId, { brandId, locationId }),
    enabled: !!organizationId,
    scopeAware: false,
    throwOnError: false,
  });

  const { data: loadedConversions = [], isLoading: loadingConversions, isError, error } = useAuthQuery({
    queryKey: ['recipe-unit-conversions', organization?.id],
    queryFn: async () => {
      try {
        return await api.entities.RecipeUnitConversion.list('from_unit', { limit: 1000 });
      } catch (fetchError) {
        const migrationPending = fetchError?.code === 'PGRST205'
          || String(fetchError?.message || '').includes('recipe_unit_conversions');
        if (migrationPending) return [];
        throw fetchError;
      }
    },
    enabled: !!organization?.id,
    throwOnError: false,
  });

  const products = useMemo(
    () => mergeConversionProducts(loadedProducts, Array.isArray(productsProp) ? productsProp : []),
    [loadedProducts, productsProp],
  );
  const conversions = (Array.isArray(conversionsProp) && conversionsProp.length > 0) ? conversionsProp : loadedConversions;
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const loading = loadingProducts || loadingConversions;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversions
      .filter((row) => {
        if (activeOnly && row.is_active === false) return false;
        if (scopeFilter === 'org' && row.product_id) return false;
        if (scopeFilter === 'product' && !row.product_id) return false;
        if (productFilter !== 'all' && row.product_id !== productFilter) return false;
        if (!term) return true;
        const productName = productMap.get(row.product_id)?.name || '';
        const haystack = [
          productName,
          row.from_unit,
          row.to_unit,
          formatConversionRule(row),
          row.product_id ? 'product' : 'all products',
        ].join(' ').toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => {
        const aName = productMap.get(a.product_id)?.name || 'All products';
        const bName = productMap.get(b.product_id)?.name || 'All products';
        return aName.localeCompare(bName) || String(a.from_unit).localeCompare(String(b.from_unit));
      });
  }, [conversions, search, scopeFilter, productFilter, activeOnly, productMap]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['recipe-unit-conversions', organization?.id] });
  };

  const openCreate = (defaults = null) => {
    setDialogDefaults(defaults || (initialProductId ? { productId: initialProductId, scope: 'product' } : { scope: 'product' }));
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!initialDialogDefaults) return;
    setScopeFilter(initialDialogDefaults.scope || 'product');
    if (initialDialogDefaults.productId) setProductFilter(initialDialogDefaults.productId);
    setDialogDefaults(initialDialogDefaults);
    setDialogOpen(true);
  }, [initialDialogDefaults]);

  const openEdit = (row) => {
    setDialogDefaults({
      id: row.id,
      scope: row.product_id ? 'product' : 'org',
      productId: row.product_id || '',
      fromUnit: row.from_unit,
      toUnit: row.to_unit,
      factor: row.factor,
      isActive: row.is_active !== false,
    });
    setDialogOpen(true);
  };

  const toggleActive = async (row) => {
    if (!canManageRecipes) return;
    try {
      await api.entities.RecipeUnitConversion.update(row.id, {
        is_active: !(row.is_active !== false),
        updated_at: new Date().toISOString(),
      });
      toast.success(row.is_active === false ? 'Conversion rule activated' : 'Conversion rule deactivated');
      await invalidate();
    } catch (toggleError) {
      toast.error(toggleError?.message || 'Unable to update conversion rule');
    }
  };

  const deleteRule = async (row) => {
    if (!canManageRecipes) return;
    const approved = await confirm({
      title: 'Delete conversion rule?',
      description: `${formatConversionRule(row)} will be permanently removed. Recipe costing will stop using this factor.`,
      confirmText: 'Delete rule',
      cancelText: 'Keep',
      variant: 'destructive',
      severity: 'high',
    });
    if (!approved) return;
    try {
      await api.entities.RecipeUnitConversion.delete(row.id);
      toast.success('Conversion rule deleted');
      await invalidate();
    } catch (deleteError) {
      toast.error(deleteError?.message || 'Unable to delete conversion rule');
    }
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {!compact && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Unit conversions</h1>
            <p className="mt-1 text-muted-foreground">
              Tenants define how purchased units map to recipe units. Example: 1 case = 24 count.
            </p>
          </div>
          <Button onClick={() => openCreate()} disabled={!canManageRecipes}>
            <Plus className="mr-2 h-4 w-4" /> Add conversion
          </Button>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        {compact && (
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-4 w-4" /> Recipe unit conversions
              </CardTitle>
              <CardDescription>
                Product price stays on Products. These rules convert recipe quantities into the product cost unit.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openCreate()} disabled={!canManageRecipes}>
              <Plus className="mr-2 h-4 w-4" /> Add
            </Button>
          </CardHeader>
        )}
        <CardContent className={compact ? 'space-y-4' : 'p-4 space-y-4'}>
          {productsError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load products</AlertTitle>
              <AlertDescription>
                {productsErrorDetail?.message || 'Could not load the Products catalog for conversion rules.'}
              </AlertDescription>
            </Alert>
          )}

          {isError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load conversion rules</AlertTitle>
              <AlertDescription>{error?.message || 'Try again after the recipe unit conversions migration is applied.'}</AlertDescription>
            </Alert>
          )}

          {initialDialogDefaults && (
            <Alert>
              <AlertTitle>Conversion rule started from a recipe</AlertTitle>
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>Enter the factor, save the rule, then return to the recipe to recalculate costs.</span>
                {returnTo ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={returnTo}>Return to recipe</Link>
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search rules or products" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger className="w-full lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                <SelectItem value="product">Product-specific</SelectItem>
                <SelectItem value="org">All products</SelectItem>
              </SelectContent>
            </Select>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-full lg:w-56"><SelectValue placeholder="Product" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={activeOnly ? 'default' : 'outline'}
              onClick={() => setActiveOnly((value) => !value)}
            >
              <ToggleLeft className="mr-2 h-4 w-4" />
              {activeOnly ? 'Active only' : 'Include inactive'}
            </Button>
          </div>

          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Factor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading conversion rules…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No conversion rules yet. Add one when a recipe unit differs from a product cost unit.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row) => {
                  const product = productMap.get(row.product_id);
                  return (
                    <TableRow key={row.id} className={row.is_active === false ? 'opacity-60' : ''}>
                      <TableCell>
                        <Badge variant="outline">{row.product_id ? 'Product' : 'All products'}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {resolveConversionProductName(productMap, row.product_id)}
                        {product?.base_unit || product?.report_by_unit ? (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            Cost unit {normalizeRecipeUnit(product.base_unit || product.report_by_unit)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatConversionRule(row)}</TableCell>
                      <TableCell>{Number(row.factor)}</TableCell>
                      <TableCell>
                        <Badge variant={row.is_active === false ? 'secondary' : 'default'}>
                          {row.is_active === false ? 'Inactive' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(row)} disabled={!canManageRecipes}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(row)} disabled={!canManageRecipes}>
                            {row.is_active === false ? 'Activate' : 'Deactivate'}
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteRule(row)} disabled={!canManageRecipes}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UnitConversionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        products={products}
        initialValues={dialogDefaults}
        existing={conversions}
        onSaved={invalidate}
      />
    </div>
  );
}
