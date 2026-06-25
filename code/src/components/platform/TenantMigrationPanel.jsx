import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import {
  getTenantReportingSnapshots,
  hasTenantMigrationBlockers,
  refreshAllTenantReportingSnapshots,
  refreshTenantReportingSnapshot,
} from '@/lib/tenantReporting';
import { cn } from '@/lib/utils';

function statusBadgeClass(status) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'archived') return 'bg-slate-50 text-slate-700 border-slate-200';
  if (status === 'failed') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

export default function TenantMigrationPanel() {
  const queryClient = useQueryClient();
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  const [refreshingOrgId, setRefreshingOrgId] = React.useState(null);

  const { data: snapshots = [], isLoading, error } = useAuthQuery({
    queryKey: ['shared-tenancy-health-snapshots'],
    queryFn: () => getTenantReportingSnapshots(),
  });

  const totals = React.useMemo(() => {
    const clientCount = snapshots.length;
    const publicModeCount = snapshots.filter((snapshot) => snapshot.read_mode === 'public' && snapshot.write_mode === 'public').length;
    const retiredSchemaCount = snapshots.filter((snapshot) => !snapshot.schema_name && snapshot.read_mode === 'public' && snapshot.write_mode === 'public').length;
    const blocked = snapshots.filter(hasTenantMigrationBlockers).length;

    return {
      clientCount,
      publicModeCount,
      retiredSchemaCount,
      blocked,
      publicModePercent: clientCount ? Math.round((publicModeCount / clientCount) * 100) : 0,
    };
  }, [snapshots]);

  const invalidateAll = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['shared-tenancy-health-snapshots'] });
  }, [queryClient]);

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      const result = await refreshAllTenantReportingSnapshots(100);
      toast.success(`Refreshed ${result?.refreshed_count ?? 0} shared-tenancy snapshots`);
      invalidateAll();
    } catch (err) {
      toast.error(err.message || 'Could not refresh shared-tenancy health snapshots');
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleRefreshOne = async (organizationId) => {
    setRefreshingOrgId(organizationId);
    try {
      await refreshTenantReportingSnapshot(organizationId);
      toast.success('Shared-tenancy snapshot refreshed');
      invalidateAll();
    } catch (err) {
      toast.error(err.message || 'Could not refresh shared-tenancy snapshot');
    } finally {
      setRefreshingOrgId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Shared Tenancy Health</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Monitor client records after schema-per-tenant retirement. The active database model is shared public tables with RLS, RBAC, and server-side financial workflows.
          </p>
        </div>
        <Button
          onClick={handleRefreshAll}
          disabled={refreshingAll}
          className="h-10 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
        >
          {refreshingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh Health
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clients</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNumber(totals.clientCount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Tracked organizations</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Public Mode</p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">{formatNumber(totals.publicModeCount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Read and write through public tables</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retired Schemas</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNumber(totals.retiredSchemaCount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">No active schema assignment</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Review Flags</p>
            <p className={cn('mt-2 text-3xl font-bold', totals.blocked ? 'text-amber-600' : 'text-emerald-600')}>{formatNumber(totals.blocked)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Data health blockers</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b bg-card/60 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-muted-foreground" />
                Shared Public Table Readiness
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{totals.publicModePercent}% of tracked clients are fully on public-table read/write mode.</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-lg px-3 py-1 text-xs">
              RLS governed
            </Badge>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${totals.publicModePercent}%` }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex items-center gap-3 p-6 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              {error.message || 'Could not load shared-tenancy snapshots'}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading shared-tenancy health...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">No health snapshots yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Refresh Health creates the first reporting view.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="min-w-[220px] text-[11px] font-bold">CLIENT</TableHead>
                    <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                    <TableHead className="text-[11px] font-bold">READ MODE</TableHead>
                    <TableHead className="text-[11px] font-bold">WRITE MODE</TableHead>
                    <TableHead className="text-[11px] font-bold">PUBLIC ROWS</TableHead>
                    <TableHead className="text-[11px] font-bold">ARCHIVE</TableHead>
                    <TableHead className="text-[11px] font-bold">FLAGS</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snapshot) => {
                    const hasBlockers = hasTenantMigrationBlockers(snapshot);
                    const refreshing = refreshingOrgId === snapshot.organization_id;
                    return (
                      <TableRow key={snapshot.organization_id}>
                        <TableCell>
                          <p className="text-sm font-bold text-foreground">{snapshot.organization_name || 'Unnamed organization'}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{snapshot.organization_id}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('capitalize', statusBadgeClass(snapshot.status))}>{snapshot.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{snapshot.read_mode || 'public'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{snapshot.write_mode || 'public'}</Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-semibold text-foreground">{formatNumber(snapshot.public_row_count)}</p>
                        </TableCell>
                        <TableCell>
                          {snapshot.schema_name ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Legacy name retained</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Schema retired</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasBlockers ? (
                            <div className="max-w-xs">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{snapshot.blocker_count} flag{snapshot.blocker_count === 1 ? '' : 's'}</Badge>
                              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                {snapshot.blockers?.[0]?.reason || 'Data health review needed'}
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Clear</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={refreshing} onClick={() => handleRefreshOne(snapshot.organization_id)}>
                            {refreshing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
                            Refresh
                          </Button>
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
