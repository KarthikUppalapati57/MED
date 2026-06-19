import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, ShieldCheck, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import {
  getTenantMigrationModeLabel,
  getTenantPilotCutovers,
  getTenantReportingSnapshots,
  hasTenantMigrationBlockers,
  prepareTenantPilotCutover,
  refreshAllTenantReportingSnapshots,
  refreshTenantReportingSnapshot,
} from '@/lib/tenantReporting';
import { cn } from '@/lib/utils';

function modeBadgeClass(mode) {
  if (mode === 'tenant_schema') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (mode === 'dual') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function statusBadgeClass(status) {
  if (status === 'active' || status === 'prepared' || status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['migrating', 'provisioning', 'preparing', 'read_cutover', 'write_cutover', 'selected'].includes(status)) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'failed' || status === 'aborted') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function readinessPercent(snapshots) {
  if (!snapshots.length) return 0;
  const readyCount = snapshots.filter((snapshot) => snapshot.ready_for_tenant_schema_reads).length;
  return Math.round((readyCount / snapshots.length) * 100);
}

function isPilotActive(pilot) {
  return pilot && !['completed', 'aborted'].includes(pilot.status);
}

export default function TenantMigrationPanel() {
  const queryClient = useQueryClient();
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  const [refreshingOrgId, setRefreshingOrgId] = React.useState(null);
  const [preparingOrgId, setPreparingOrgId] = React.useState(null);

  const { data: snapshots = [], isLoading, error } = useAuthQuery({
    queryKey: ['tenant-reporting-snapshots'],
    queryFn: () => getTenantReportingSnapshots(),
  });

  const { data: pilots = [] } = useAuthQuery({
    queryKey: ['tenant-pilot-cutovers'],
    queryFn: () => getTenantPilotCutovers(),
  });

  const pilotByOrg = React.useMemo(() => {
    return pilots.reduce((acc, pilot) => {
      if (!acc[pilot.organization_id] || new Date(pilot.updated_at) > new Date(acc[pilot.organization_id].updated_at)) {
        acc[pilot.organization_id] = pilot;
      }
      return acc;
    }, {});
  }, [pilots]);

  const totals = React.useMemo(() => {
    const tenantCount = snapshots.length;
    const schemaCount = snapshots.filter((snapshot) => snapshot.schema_exists).length;
    const readReady = snapshots.filter((snapshot) => snapshot.ready_for_tenant_schema_reads).length;
    const writeReady = snapshots.filter((snapshot) => snapshot.ready_for_tenant_schema_writes).length;
    const blocked = snapshots.filter(hasTenantMigrationBlockers).length;
    const activePilots = pilots.filter(isPilotActive).length;

    return { tenantCount, schemaCount, readReady, writeReady, blocked, activePilots, readiness: readinessPercent(snapshots) };
  }, [pilots, snapshots]);

  const invalidateAll = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tenant-reporting-snapshots'] });
    queryClient.invalidateQueries({ queryKey: ['tenant-pilot-cutovers'] });
  }, [queryClient]);

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      const result = await refreshAllTenantReportingSnapshots(100);
      toast.success(`Refreshed ${result?.refreshed_count ?? 0} tenant snapshots`);
      invalidateAll();
    } catch (err) {
      toast.error(err.message || 'Could not refresh tenant migration snapshots');
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleRefreshOne = async (organizationId) => {
    setRefreshingOrgId(organizationId);
    try {
      await refreshTenantReportingSnapshot(organizationId);
      toast.success('Tenant snapshot refreshed');
      invalidateAll();
    } catch (err) {
      toast.error(err.message || 'Could not refresh tenant snapshot');
    } finally {
      setRefreshingOrgId(null);
    }
  };

  const handlePreparePilot = async (snapshot) => {
    setPreparingOrgId(snapshot.organization_id);
    try {
      const result = await prepareTenantPilotCutover(snapshot.organization_id);
      if (result?.success) {
        toast.success(`${snapshot.organization_name || 'Tenant'} is prepared for pilot read cutover`);
      } else {
        toast.warning(`${snapshot.organization_name || 'Tenant'} still has pilot blockers`);
      }
      invalidateAll();
    } catch (err) {
      toast.error(err.message || 'Could not prepare tenant pilot');
    } finally {
      setPreparingOrgId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tenant Migration Control</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Monitor schema-per-tenant rollout readiness and prepare one pilot tenant at a time. Read/write cutovers remain guarded by confirmation RPCs and the runbook.
          </p>
        </div>
        <Button
          onClick={handleRefreshAll}
          disabled={refreshingAll}
          className="h-10 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
        >
          {refreshingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh Snapshots
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tenants</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNumber(totals.tenantCount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Tracked in registry</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Schemas</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNumber(totals.schemaCount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Provisioned schemas</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Read Ready</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNumber(totals.readReady)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Validation passed</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Write Ready</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNumber(totals.writeReady)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Write cutover ready</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pilots</p>
            <p className="mt-2 text-3xl font-bold text-sky-700">{formatNumber(totals.activePilots)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active pilot runs</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Blocked</p>
            <p className={cn('mt-2 text-3xl font-bold', totals.blocked ? 'text-amber-600' : 'text-emerald-600')}>{formatNumber(totals.blocked)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active blockers</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b bg-card/60 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-muted-foreground" />
                Migration Readiness
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{totals.readiness}% of tracked tenants are read-cutover ready.</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-lg px-3 py-1 text-xs">
              Pilot gated
            </Badge>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${totals.readiness}%` }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex items-center gap-3 p-6 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              {error.message || 'Could not load tenant migration snapshots'}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading migration snapshots...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">No snapshots yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Run Refresh Snapshots to create the first reporting view.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="min-w-[220px] text-[11px] font-bold">TENANT</TableHead>
                    <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                    <TableHead className="text-[11px] font-bold">PILOT</TableHead>
                    <TableHead className="text-[11px] font-bold">MODES</TableHead>
                    <TableHead className="text-[11px] font-bold">ROWS</TableHead>
                    <TableHead className="text-[11px] font-bold">READINESS</TableHead>
                    <TableHead className="text-[11px] font-bold">BLOCKERS</TableHead>
                    <TableHead className="min-w-[210px] text-right text-[11px] font-bold">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snapshot) => {
                    const hasBlockers = hasTenantMigrationBlockers(snapshot);
                    const refreshing = refreshingOrgId === snapshot.organization_id;
                    const preparing = preparingOrgId === snapshot.organization_id;
                    const pilot = pilotByOrg[snapshot.organization_id];
                    return (
                      <TableRow key={snapshot.organization_id}>
                        <TableCell>
                          <p className="font-bold text-sm text-foreground">{snapshot.organization_name || 'Unnamed organization'}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{snapshot.schema_name || 'No tenant schema assigned'}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('capitalize', statusBadgeClass(snapshot.status))}>{snapshot.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {pilot ? (
                            <div className="space-y-1">
                              <Badge variant="outline" className={cn('capitalize', statusBadgeClass(pilot.status))}>{pilot.status.replace('_', ' ')}</Badge>
                              <p className="text-[10px] text-muted-foreground">{pilot.updated_at ? new Date(pilot.updated_at).toLocaleDateString() : 'Queued'}</p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">Not selected</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={cn('w-fit text-[10px]', modeBadgeClass(snapshot.read_mode))}>Read: {snapshot.read_mode}</Badge>
                            <Badge variant="outline" className={cn('w-fit text-[10px]', modeBadgeClass(snapshot.write_mode))}>Write: {snapshot.write_mode}</Badge>
                            <span className="sr-only">{getTenantMigrationModeLabel(snapshot)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-semibold text-foreground">Public {formatNumber(snapshot.public_row_count)}</p>
                          <p className="text-[10px] text-muted-foreground">Tenant {formatNumber(snapshot.tenant_schema_row_count)} / Delta {formatNumber(snapshot.row_count_delta)}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', snapshot.ready_for_tenant_schema_reads ? 'text-emerald-700' : 'text-amber-700')}>
                              {snapshot.ready_for_tenant_schema_reads ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              Reads
                            </span>
                            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', snapshot.ready_for_tenant_schema_writes ? 'text-emerald-700' : 'text-amber-700')}>
                              {snapshot.ready_for_tenant_schema_writes ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              Writes
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasBlockers ? (
                            <div className="max-w-xs">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{snapshot.blocker_count} blocker{snapshot.blocker_count === 1 ? '' : 's'}</Badge>
                              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                {snapshot.blockers?.[0]?.reason || 'Validation blockers present'}
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Clear</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={refreshing || preparing} onClick={() => handleRefreshOne(snapshot.organization_id)}>
                              {refreshing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
                              Refresh
                            </Button>
                            <Button size="sm" className="h-8 rounded-lg bg-slate-900 text-xs text-white hover:bg-slate-800" disabled={refreshing || preparing} onClick={() => handlePreparePilot(snapshot)}>
                              {preparing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <PlayCircle className="mr-1.5 h-3 w-3" />}
                              Prepare Pilot
                            </Button>
                          </div>
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