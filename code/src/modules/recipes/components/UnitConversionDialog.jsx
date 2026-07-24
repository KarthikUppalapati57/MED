import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { loadConversionCatalogProducts, mergeConversionProducts, formatConversionProductOption } from '@/modules/recipes/lib/conversionProducts';
import {
  CUSTOM_UNIT_VALUE,
  RECIPE_UNIT_OPTIONS,
  RECIPE_UNIT_CONVERSION_WRITE_FIELDS,
  buildConversionChecklist,
  buildRecipeUnitConversionWritePayload,
  buildUnitSelectOptions,
  calculateConvertedUnitCost,
  findDuplicateConversion,
  formatConversionRule,
  getProductCostUnit,
  getSuspiciousConversionWarnings,
  isConversionDraftValid,
  normalizeRecipeUnit,
} from '@/modules/recipes/lib/recipeUnits';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function emptyDraft(defaults = {}, products = []) {
  const selected = products.find((product) => product.id === defaults.productId);
  const costUnit = getProductCostUnit(selected);
  const resolvedScope = defaults.scope || 'product';
  const fromNormalized = normalizeRecipeUnit(
    resolvedScope === 'product' ? (costUnit || defaults.fromUnit) : defaults.fromUnit
  );
  const toNormalized = normalizeRecipeUnit(defaults.toUnit);
  return {
    id: defaults.id || null,
    scope: resolvedScope,
    productId: defaults.productId || '',
    fromUnit: fromNormalized || '',
    toUnit: toNormalized || '',
    fromMode: !fromNormalized || RECIPE_UNIT_OPTIONS.includes(fromNormalized) ? 'preset' : 'custom',
    toMode: !toNormalized || RECIPE_UNIT_OPTIONS.includes(toNormalized) ? 'preset' : 'custom',
    customFrom: fromNormalized && !RECIPE_UNIT_OPTIONS.includes(fromNormalized) ? fromNormalized : '',
    customTo: toNormalized && !RECIPE_UNIT_OPTIONS.includes(toNormalized) ? toNormalized : '',
    factor: defaults.factor != null && defaults.factor !== '' ? String(defaults.factor) : '',
    isActive: defaults.isActive !== false,
    focusFactor: Boolean(defaults.focusFactor),
    sampleQuantity: Number(defaults.sampleQuantity) > 0 ? Number(defaults.sampleQuantity) : 2,
  };
}

function resolveUnit(mode, preset, custom) {
  return normalizeRecipeUnit(mode === 'custom' ? custom : preset);
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function UnitSelect({ value, mode, customValue, options, onSelect, onCustomChange, disabled = false, id, className }) {
  return (
    <div className={cn('space-y-1 min-w-[8rem] flex-1', className)}>
      <Select
        value={mode === 'custom' ? CUSTOM_UNIT_VALUE : (value || undefined)}
        onValueChange={onSelect}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder="Unit" />
        </SelectTrigger>
        <SelectContent>
          {options.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
          {!disabled && <SelectItem value={CUSTOM_UNIT_VALUE}>Custom…</SelectItem>}
        </SelectContent>
      </Select>
      {mode === 'custom' && !disabled && (
        <Input placeholder="Custom unit" value={customValue} onChange={(event) => onCustomChange(event.target.value)} />
      )}
    </div>
  );
}

function ChecklistItem({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        : <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export default function UnitConversionDialog({
  open,
  onOpenChange,
  products: productsProp = [],
  initialValues = null,
  existing = [],
  onSaved,
}) {
  const { organization, brand, location } = useAuth();
  const { canManageRecipes } = usePermissions();
  const baselineRef = useRef(null);
  const [draft, setDraft] = useState(() => emptyDraft(initialValues || {}, productsProp));
  const [saving, setSaving] = useState(false);
  const factorRef = useRef(null);

  const organizationId = organization?.id || null;
  const brandId = brand?.brand_id || brand?.id || null;
  const locationId = location?.id || null;

  const { data: catalogProducts = [], isLoading: loadingCatalog } = useAuthQuery({
    queryKey: ['conversion-catalog-products', organizationId, brandId, locationId],
    queryFn: () => loadConversionCatalogProducts(organizationId, { brandId, locationId }),
    enabled: open && !!organizationId,
    scopeAware: false,
    throwOnError: false,
  });

  const products = useMemo(
    () => mergeConversionProducts(catalogProducts, Array.isArray(productsProp) ? productsProp : []),
    [catalogProducts, productsProp],
  );

  useEffect(() => {
    if (!open) return;
    // Seed once per open/defaults. Catalog may arrive later; locked from-unit
    // is derived from selectedProduct at render time so we do not wipe edits.
    const next = emptyDraft(initialValues || {}, products);
    setDraft(next);
    baselineRef.current = next;
  }, [open, initialValues]);

  useEffect(() => {
    if (!open || !draft.focusFactor) return;
    const timer = window.setTimeout(() => factorRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open, draft.focusFactor, draft.productId, draft.toUnit]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === draft.productId) || null,
    [products, draft.productId],
  );
  const lockFromUnit = draft.scope === 'product' && Boolean(draft.productId);
  const lockedFromUnit = lockFromUnit ? getProductCostUnit(selectedProduct) : '';

  const unitOptions = useMemo(
    () => buildUnitSelectOptions([
      ...products.flatMap((product) => [product.base_unit, product.report_by_unit]),
      draft.fromUnit,
      draft.toUnit,
      draft.customFrom,
      draft.customTo,
      lockedFromUnit,
    ]),
    [products, draft.fromUnit, draft.toUnit, draft.customFrom, draft.customTo, lockedFromUnit],
  );

  const fromUnit = lockFromUnit
    ? lockedFromUnit
    : resolveUnit(draft.fromMode, draft.fromUnit, draft.customFrom);
  const toUnit = resolveUnit(draft.toMode, draft.toUnit, draft.customTo);
  const factorNumber = Number(draft.factor);
  const purchasePrice = Number(selectedProduct?.latest_price || 0);
  const recipeUnitCost = calculateConvertedUnitCost(purchasePrice, factorNumber);
  const sampleQty = Number(draft.sampleQuantity) > 0 ? Number(draft.sampleQuantity) : 2;
  const sampleIngredientCost = recipeUnitCost == null ? null : recipeUnitCost * sampleQty;
  const equationLabel = formatConversionRule({ fromUnit, toUnit, factor: draft.factor });

  const duplicate = findDuplicateConversion({
    existing,
    scope: draft.scope,
    productId: draft.productId,
    fromUnit,
    toUnit,
    excludeId: draft.id,
  });

  const checklist = buildConversionChecklist({
    scope: draft.scope,
    productId: draft.productId,
    fromUnit,
    toUnit,
    factor: draft.factor,
    hasDuplicate: Boolean(duplicate),
  });
  const warnings = getSuspiciousConversionWarnings({ fromUnit, toUnit, factor: draft.factor });
  const canSubmit = canManageRecipes
    && isConversionDraftValid({
      scope: draft.scope,
      productId: draft.productId,
      fromUnit,
      toUnit,
      factor: draft.factor,
    })
    && !duplicate
    && !(lockFromUnit && !fromUnit);

  const relatedRules = useMemo(() => {
    if (draft.scope === 'product' && draft.productId) {
      return existing.filter((row) => !row.product_id || row.product_id === draft.productId);
    }
    return existing.filter((row) => !row.product_id);
  }, [existing, draft.scope, draft.productId]);

  const selectProduct = (productId) => {
    const product = products.find((entry) => entry.id === productId);
    const costUnit = getProductCostUnit(product);
    setDraft((current) => ({
      ...current,
      productId,
      fromUnit: costUnit,
      fromMode: !costUnit || RECIPE_UNIT_OPTIONS.includes(costUnit) ? 'preset' : 'custom',
      customFrom: costUnit && !RECIPE_UNIT_OPTIONS.includes(costUnit) ? costUnit : '',
    }));
  };

  const setUnitSide = (side, value) => {
    if (side === 'from' && lockFromUnit) return;
    if (value === CUSTOM_UNIT_VALUE) {
      setDraft((current) => ({
        ...current,
        [`${side}Mode`]: 'custom',
        [side === 'from' ? 'fromUnit' : 'toUnit']: '',
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      [`${side}Mode`]: 'preset',
      [side === 'from' ? 'fromUnit' : 'toUnit']: value,
      [side === 'from' ? 'customFrom' : 'customTo']: '',
    }));
  };

  const reset = () => {
    setDraft(emptyDraft({
      id: draft.id,
      scope: draft.scope,
      productId: draft.scope === 'product' ? draft.productId : '',
      fromUnit: draft.scope === 'product' ? getProductCostUnit(selectedProduct) : '',
      toUnit: '',
      factor: '',
      isActive: true,
      sampleQuantity: draft.sampleQuantity,
    }, products));
  };

  const save = async () => {
    if (!canSubmit) {
      toast.error(duplicate ? 'A conversion rule already exists for this unit pair and scope.' : 'Complete the rule before saving.');
      return;
    }
    if (!organization?.id) {
      toast.error('Organization is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = buildRecipeUnitConversionWritePayload({
        organizationId: organization.id,
        scope: draft.scope,
        productId: draft.productId,
        fromUnit,
        toUnit,
        factor: draft.factor,
        isActive: draft.isActive,
      });
      // Ownership guard: conversion writes never touch product purchase fields.
      const unexpected = Object.keys(payload).filter((key) => !RECIPE_UNIT_CONVERSION_WRITE_FIELDS.includes(key));
      if (unexpected.length) {
        throw new Error(`Conversion payload includes non-conversion fields: ${unexpected.join(', ')}`);
      }
      const saved = draft.id
        ? await api.entities.RecipeUnitConversion.update(draft.id, payload)
        : await api.entities.RecipeUnitConversion.create(payload);
      toast.success(draft.id ? 'Conversion rule updated' : 'Conversion rule created');
      await onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      toast.error(error?.message || 'Unable to save conversion rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? 'Edit conversion rule' : 'Recipe unit conversion'}</DialogTitle>
          <DialogDescription>
            Build how purchased pack sizes map into recipe units used by costing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <SummaryCard
              label="Selected product"
              value={draft.scope === 'product' ? (selectedProduct?.name || 'Not selected') : 'All products'}
            />
            <SummaryCard label="Purchase unit" value={fromUnit || '—'} />
            <SummaryCard
              label="Purchase cost"
              value={draft.scope === 'product' && selectedProduct ? money.format(purchasePrice) : '—'}
            />
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">Rule status</p>
              <Badge className="mt-1" variant={canSubmit ? 'default' : 'secondary'}>
                {canSubmit ? 'Ready' : 'Incomplete'}
              </Badge>
            </div>
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Step 1: Choose the rule scope</h3>
              <p className="text-xs text-muted-foreground">Product-specific rules override organization-wide rules.</p>
            </div>
            <RadioGroup
              value={draft.scope}
              onValueChange={(scope) => setDraft((current) => {
                if (scope === 'org') return { ...current, scope, productId: '' };
                const product = products.find((entry) => entry.id === current.productId);
                const costUnit = getProductCostUnit(product);
                return {
                  ...current,
                  scope,
                  fromUnit: costUnit || current.fromUnit,
                  fromMode: !costUnit || RECIPE_UNIT_OPTIONS.includes(costUnit) ? 'preset' : 'custom',
                  customFrom: costUnit && !RECIPE_UNIT_OPTIONS.includes(costUnit) ? costUnit : '',
                };
              })}
              className="grid gap-3 md:grid-cols-2"
            >
              <label className={cn('flex cursor-pointer gap-3 rounded-xl border p-4', draft.scope === 'product' && 'border-primary bg-primary/5')}>
                <RadioGroupItem value="product" className="mt-1" />
                <span>
                  <span className="font-medium block">Product-specific</span>
                  <span className="text-sm text-muted-foreground">Best for unique pack sizes, such as one chicken case containing 24 pieces.</span>
                </span>
              </label>
              <label className={cn('flex cursor-pointer gap-3 rounded-xl border p-4', draft.scope === 'org' && 'border-primary bg-primary/5')}>
                <RadioGroupItem value="org" className="mt-1" />
                <span>
                  <span className="font-medium block">All products</span>
                  <span className="text-sm text-muted-foreground">Best for universal standards, such as 1 lb = 16 oz.</span>
                </span>
              </label>
            </RadioGroup>
          </section>

          {draft.scope === 'product' && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Step 2: Select a purchased product</h3>
              </div>
              <Select value={draft.productId || undefined} onValueChange={selectProduct} disabled={loadingCatalog && !products.length}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={
                    loadingCatalog && !products.length
                      ? 'Loading products…'
                      : products.length
                        ? 'Select a purchased product'
                        : 'No products available'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {formatConversionProductOption(product)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingCatalog && !products.length && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading Products catalog…
                </p>
              )}
              {!loadingCatalog && !products.length && (
                <Alert>
                  <AlertTitle>No products available for this location</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center gap-2">
                    The Products catalog for the selected organization, brand, and location is empty. Create purchased products first.
                    <Button asChild size="sm" variant="outline"><Link to="/Products/all-products">Open Products</Link></Button>
                  </AlertDescription>
                </Alert>
              )}
            </section>
          )}

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Step {draft.scope === 'product' ? '3' : '2'}: Define the conversion</h3>
              <p className="text-xs text-muted-foreground">
                {draft.scope === 'product'
                  ? 'The purchase unit is filled automatically from the selected product.'
                  : 'This rule applies globally unless overridden by a product-specific rule.'}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border p-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Purchased unit</Label>
                {lockFromUnit ? (
                  <Input className="h-11 w-32 bg-muted" value={fromUnit || '—'} readOnly disabled />
                ) : (
                  <UnitSelect
                    value={draft.fromUnit}
                    mode={draft.fromMode}
                    customValue={draft.customFrom}
                    options={unitOptions}
                    onSelect={(value) => setUnitSide('from', value)}
                    onCustomChange={(customFrom) => setDraft((current) => ({ ...current, customFrom }))}
                  />
                )}
              </div>
              <span className="pb-2 text-xl font-semibold">=</span>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Factor</Label>
                <Input
                  ref={factorRef}
                  className="h-11 w-28"
                  type="number"
                  min="0.00000001"
                  step="any"
                  value={draft.factor}
                  onChange={(event) => setDraft((current) => ({ ...current, factor: event.target.value, focusFactor: false }))}
                  placeholder="24"
                />
              </div>
              <span className="pb-2 text-xl font-semibold">×</span>
              <div className="space-y-1 min-w-[8rem] flex-1">
                <Label className="text-xs text-muted-foreground">Recipe unit</Label>
                <UnitSelect
                  value={draft.toUnit}
                  mode={draft.toMode}
                  customValue={draft.customTo}
                  options={unitOptions}
                  onSelect={(value) => setUnitSide('to', value)}
                  onCustomChange={(customTo) => setDraft((current) => ({ ...current, customTo }))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              <span className="font-semibold">{equationLabel}</span>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Switch checked={draft.isActive} onCheckedChange={(isActive) => setDraft((current) => ({ ...current, isActive }))} />
              <div>
                <p className="font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive rules remain stored but are ignored by costing.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-[1fr_auto] md:items-start">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {checklist.map((item) => <ChecklistItem key={item.id} ok={item.ok} label={item.label} />)}
            </div>
            <div className="flex gap-2 md:justify-end">
              <Button type="button" variant="outline" onClick={reset} disabled={saving}>Reset</Button>
              <Button type="button" onClick={save} disabled={saving || !canSubmit}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : (draft.id ? 'Save changes' : 'Create rule')}
              </Button>
            </div>
          </div>

          {duplicate && (
            <Alert variant="destructive">
              <AlertTitle>Duplicate rule</AlertTitle>
              <AlertDescription>{formatConversionRule(duplicate)} already exists for this scope.</AlertDescription>
            </Alert>
          )}

          {warnings.length > 0 && !duplicate && canSubmit && (
            <Alert>
              <AlertTitle>Double-check this conversion</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </AlertDescription>
            </Alert>
          )}

          {draft.scope === 'product' && selectedProduct && (
            <section className="space-y-2 rounded-xl border p-4">
              <h3 className="text-sm font-semibold">Product context</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Product', selectedProduct.name],
                  ['Category', selectedProduct.category || '—'],
                  ['Vendor', selectedProduct.primary_vendor_name || selectedProduct.vendor_name || '—'],
                  ['Purchase unit', fromUnit || '—'],
                  ['Purchase cost', `${money.format(purchasePrice)}${fromUnit ? ` / ${fromUnit}` : ''}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {draft.scope === 'product' && selectedProduct && Number.isFinite(factorNumber) && factorNumber > 0 && fromUnit && toUnit && (
            <section className="space-y-3 rounded-xl border p-4">
              <div>
                <h3 className="text-sm font-semibold">Live costing preview</h3>
                <p className="text-xs text-muted-foreground">
                  Recipe unit cost = purchase cost ÷ conversion factor.
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Purchase cost</dt>
                  <dd className="font-medium">{money.format(purchasePrice)} per {fromUnit}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Conversion</dt>
                  <dd className="font-medium">{equationLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t pt-2">
                  <dt className="text-muted-foreground">Calculated cost</dt>
                  <dd className="font-semibold">
                    {recipeUnitCost == null ? '—' : `${money.format(recipeUnitCost)} per ${toUnit}`}
                  </dd>
                </div>
              </dl>
              <div className="rounded-xl border bg-muted/20 px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">Cost per recipe unit</p>
                <p className="mt-1 text-3xl font-semibold">{recipeUnitCost == null ? '—' : money.format(recipeUnitCost)}</p>
                <p className="text-sm text-muted-foreground">per {toUnit}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Recipe quantity</span>
                  <span className="font-medium">{sampleQty} {toUnit}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Ingredient cost</span>
                  <span className="font-medium">{sampleIngredientCost == null ? '—' : money.format(sampleIngredientCost)}</span>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Existing rules</h3>
              <Badge variant="secondary">{draft.scope === 'product' ? 'Product-specific' : 'Organization-wide'}</Badge>
            </div>
            {relatedRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No related rules yet.</p>
            ) : (
              <div className="space-y-2">
                {relatedRules.slice(0, 6).map((row) => (
                  <div key={row.id} className="rounded-lg border px-3 py-2">
                    <p className="font-medium">{formatConversionRule(row)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.is_active === false ? 'Inactive' : 'Active'} · {row.product_id ? 'Product-specific' : 'Organization-wide'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {!canManageRecipes && (
            <Alert>
              <AlertTitle>View only</AlertTitle>
              <AlertDescription>Managers and above can create or edit conversion rules.</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
