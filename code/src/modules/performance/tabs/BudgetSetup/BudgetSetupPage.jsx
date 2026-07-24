import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { filterByContext } from '@/lib/contextUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BUDGET_SETUP_DEMO_CATEGORIES,
  BUDGET_SETUP_DEMO_LOCATIONS,
  getBudgetSetupDemoSeedTargets,
} from '@/modules/performance/demo/budgetSetupDemoData';

const ORG_WIDE = '__org__';

function startOfMonthIso(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonthIso(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function normalizeCategory(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

/**
 * Budget Setup — purchasing category targets only.
 * Real mode: categories/locations from Products, allocations, Locations.
 * Demo mode (VITE_PERFORMANCE_DEMO=true): in-memory demo only — never written to DB.
 */
export default function BudgetSetupPage({ periodStart: initialPeriodStart, periodEnd: initialPeriodEnd } = {}) {
  const demo = import.meta.env.VITE_PERFORMANCE_DEMO === 'true';
  const { organization, brand, location, userProfile } = useAuth();
  const queryClient = useQueryClient();

  const [periodStart, setPeriodStart] = useState(initialPeriodStart || startOfMonthIso());
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd || endOfMonthIso());
  const [selectedLocationId, setSelectedLocationId] = useState(
    location?.id && !demo ? location.id : ORG_WIDE
  );
  const [drafts, setDrafts] = useState({});
  const [demoTargets, setDemoTargets] = useState(() =>
    getBudgetSetupDemoSeedTargets(startOfMonthIso(), endOfMonthIso())
  );

  const scopeLocationId = selectedLocationId === ORG_WIDE ? null : selectedLocationId;

  useEffect(() => {
    if (initialPeriodStart) setPeriodStart(initialPeriodStart);
    if (initialPeriodEnd) setPeriodEnd(initialPeriodEnd);
  }, [initialPeriodStart, initialPeriodEnd]);

  useEffect(() => {
    if (!demo) return;
    setDemoTargets((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = {
          ...next[key],
          period_start: periodStart,
          period_end: periodEnd,
          location_id: scopeLocationId,
        };
      }
      return next;
    });
  }, [demo, periodStart, periodEnd, scopeLocationId]);

  const results = useAuthQueries({
    queries: [
      {
        // Direct client, not api.entities.Product.filter(): the entity client auto-injects the
        // cached nav-bar location into the query (withActiveScope), which would silently drop
        // products from every other location/brand before this page's own location selector
        // (scopeLocationId) ever gets to filter them via the select callback below.
        queryKey: ['budget_setup_products', organization?.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', organization?.id)
            .is('deleted_at', null);
          if (error) throw error;
          return data || [];
        },
        select: React.useCallback(
          (data) => filterByContext(data || [], { organization, brand, location: null }),
          [organization, brand]
        ),
        enabled: !demo && !!organization?.id,
      },
      {
        queryKey: ['budget_setup_allocations', organization?.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('invoice_allocations')
            .select('*')
            .eq('organization_id', organization?.id);
          if (error) throw error;
          return data || [];
        },
        select: React.useCallback(
          (data) => filterByContext(data || [], { organization, brand, location: null }),
          [organization, brand]
        ),
        enabled: !demo && !!organization?.id,
      },
      {
        queryKey: ['budget_setup_locations', organization?.id],
        queryFn: () => api.entities.Location.filter({ organization_id: organization?.id }),
        select: React.useCallback(
          (data) => filterByContext(data || [], { organization, brand, location: null }),
          [organization, brand]
        ),
        enabled: !demo && !!organization?.id,
      },
      {
        queryKey: [
          'budget_setup_targets',
          organization?.id,
          brand?.brand_id || brand?.id,
          scopeLocationId,
          periodStart,
          periodEnd,
        ],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('budget_targets')
            .select('*')
            .eq('organization_id', organization?.id);
          if (error) throw error;
          return data || [];
        },
        select: React.useCallback(
          (data) => {
            const scoped = filterByContext(data || [], { organization, brand, location: null });
            return scoped.filter((row) => {
              if (row.period_start !== periodStart || row.period_end !== periodEnd) return false;
              if (scopeLocationId == null) return row.location_id == null;
              return row.location_id === scopeLocationId;
            });
          },
          [organization, brand, periodStart, periodEnd, scopeLocationId]
        ),
        enabled: !demo && !!organization?.id && !!periodStart && !!periodEnd,
      },
    ],
  });

  const products = results[0].data || [];
  const allocations = results[1].data || [];
  const locations = demo ? BUDGET_SETUP_DEMO_LOCATIONS : results[2].data || [];
  const budgetTargets = demo ? Object.values(demoTargets) : results[3].data || [];
  const loading =
    !demo &&
    (results[0].isLoading || results[1].isLoading || results[2].isLoading || results[3].isLoading);

  const categories = useMemo(() => {
    if (demo) return [...BUDGET_SETUP_DEMO_CATEGORIES];
    const set = new Set();
    for (const p of products) {
      const cat = normalizeCategory(p.category);
      if (cat) set.add(cat);
    }
    for (const a of allocations) {
      if (a.allocation_type && a.allocation_type !== 'line_items') continue;
      const cat = normalizeCategory(a.category_name);
      if (cat) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [demo, products, allocations]);

  const targetByCategory = useMemo(() => {
    const map = {};
    for (const row of budgetTargets) {
      const cat = normalizeCategory(row.category);
      if (cat) map[cat] = row;
    }
    return map;
  }, [budgetTargets]);

  const saveTarget = useMutation({
    mutationFn: async ({ category, targetAmount }) => {
      const amount = Number(targetAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Enter a valid non-negative budget amount');
      }
      if (periodEnd < periodStart) {
        throw new Error('Period end must be on or after period start');
      }

      if (demo) {
        await new Promise((r) => setTimeout(r, 200));
        return {
          id: targetByCategory[category]?.id || `demo-bt-${category}`,
          category,
          target_amount: amount,
          period_start: periodStart,
          period_end: periodEnd,
          location_id: scopeLocationId,
        };
      }

      const existing = targetByCategory[category];
      const payload = {
        organization_id: organization?.id,
        brand_id: (brand?.brand_id || brand?.id) || null,
        location_id: scopeLocationId,
        period_start: periodStart,
        period_end: periodEnd,
        category,
        target_amount: amount,
        target_percent: null,
        created_by: userProfile?.id || null,
        updated_by: userProfile?.id || null,
      };
      if (existing) return api.entities.BudgetTarget.update(existing.id, payload);
      return api.entities.BudgetTarget.create(payload);
    },
    onSuccess: (row, vars) => {
      if (demo) {
        setDemoTargets((prev) => ({ ...prev, [vars.category]: row }));
        toast.success('Demo budget saved (not written to database)');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['budget_setup_targets'] });
      queryClient.invalidateQueries({ queryKey: ['budget_targets'] });
      toast.success('Budget target saved');
    },
    onError: (error) => toast.error(error.message || 'Failed to save budget target'),
  });

  const clearTarget = useMutation({
    mutationFn: async (category) => {
      if (demo) {
        await new Promise((r) => setTimeout(r, 150));
        return category;
      }
      const existing = targetByCategory[category];
      if (!existing) return null;
      return api.entities.BudgetTarget.delete(existing.id);
    },
    onSuccess: (_data, category) => {
      if (demo) {
        setDemoTargets((prev) => {
          const next = { ...prev };
          delete next[category];
          return next;
        });
        toast.success('Demo budget cleared (not written to database)');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['budget_setup_targets'] });
      queryClient.invalidateQueries({ queryKey: ['budget_targets'] });
      toast.success('Budget target cleared');
    },
    onError: (error) => toast.error(error.message || 'Failed to clear budget target'),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Budget Setup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set purchasing category budgets for a period and location. Categories come from Products and
            invoice allocations only — no Sales, Labor, or POS targets.
          </p>
        </div>
        {demo ? (
          <Badge variant="secondary">Demo Mode — not saved to database</Badge>
        ) : null}
      </div>

      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Period & location</CardTitle>
          <CardDescription>
            Targets apply to the selected date range and location scope. Leave location as
            organization-wide for org-level budgets.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Period start</label>
            <Input
              type="date"
              value={periodStart}
              max={periodEnd}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Period end</label>
            <Input
              type="date"
              value={periodEnd}
              min={periodStart}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Location</label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORG_WIDE}>Organization-wide</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name || loc.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary" className="mb-1">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} from {demo ? 'demo' : 'modules'}
          </Badge>
        </CardContent>
      </Card>

      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Purchasing category budgets</CardTitle>
          <CardDescription>
            Blank amount means no budget configured (not treated as $0). Clear removes a saved target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center animate-pulse">
              Loading categories from modules…
            </p>
          ) : categories.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium">No categories available</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Add product categories in the Products module, or generate invoice allocations with
                category names. Budget Setup will not invent category lists.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current budget</TableHead>
                    <TableHead>New amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => {
                    const existing = targetByCategory[category];
                    const draftValue =
                      drafts[category] !== undefined
                        ? drafts[category]
                        : existing?.target_amount ?? '';
                    return (
                      <TableRow key={category}>
                        <TableCell className="font-medium whitespace-nowrap">{category}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                          {existing == null
                            ? 'No budget configured'
                            : `$${Number(existing.target_amount || 0).toLocaleString()}`}
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <Input
                            type="number"
                            min="0"
                            step="100"
                            placeholder="Enter amount"
                            value={draftValue}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [category]: e.target.value }))
                            }
                            className="w-full sm:max-w-40"
                          />
                        </TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saveTarget.isPending || draftValue === '' || draftValue == null}
                            onClick={() =>
                              saveTarget.mutate({
                                category,
                                targetAmount: draftValue,
                              })
                            }
                          >
                            Save
                          </Button>
                          {existing ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={clearTarget.isPending}
                              onClick={() => {
                                setDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[category];
                                  return next;
                                });
                                clearTarget.mutate(category);
                              }}
                            >
                              Clear
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


