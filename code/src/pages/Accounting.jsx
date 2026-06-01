import React from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Link2, AlertCircle, CheckCircle2, ArrowRightLeft, Lock, FileText, Calendar } from 'lucide-react';
import { toast } from "sonner";
import { format } from 'date-fns';

export default function Accounting() {
  const { data: logs = [], isLoading: loadingLogs } = useAuthQuery({
    queryKey: ['accounting_sync_logs'],
    queryFn: () => api.entities.AccountingSyncLog.list('-created_at'),
  });

  const { data: integrations = [], isLoading: loadingIntegrations } = useAuthQuery({
    queryKey: ['integrations'],
    queryFn: () => api.entities.Integration.list('-created_at'),
  });

  const { data: closedPeriods = [], isLoading: loadingPeriods, refetch: refetchPeriods } = useAuthQuery({
    queryKey: ['closed_periods'],
    queryFn: () => api.entities.ClosedPeriod.list('-start_date'),
  });

  const [activeTab, setActiveTab] = React.useState('sync');
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);

  const activeIntegrations = integrations.filter(i => i.is_active).length;
  const recentErrors = logs.filter(l => l.sync_status === 'failed').length;
  const syncSuccessRate = logs.length > 0 
    ? ((logs.filter(l => l.sync_status === 'success').length / logs.length) * 100).toFixed(1) 
    : 100;

  const handleClosePeriod = async () => {
    setIsClosing(true);
    try {
      const now = new Date();
      const month = now.toLocaleString('default', { month: 'long' });
      await api.entities.ClosedPeriod.create({
        period_name: `${month} ${now.getFullYear()} (Current)`,
        start_date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
        end_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
        notes: 'Manually closed by user'
      });
      toast.success("Accounting period successfully locked.");
      setCloseDialogOpen(false);
      refetchPeriods();
    } catch (e) {
      toast.error("Failed to close period.");
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-scale">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Accounting Sync</h1>
        <p className="text-muted-foreground mt-1 text-lg">Manage financial integrations and sync logs.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-brand/10 rounded-xl">
              <Link2 className="h-6 w-6 text-brand" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Integrations</p>
              <h3 className="text-2xl font-bold text-foreground">{activeIntegrations}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-green/10 rounded-xl">
              <CheckCircle2 className="h-6 w-6 text-resend-green" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sync Success Rate</p>
              <h3 className="text-2xl font-bold text-foreground">{syncSuccessRate}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-resend-red/10 rounded-xl">
              <AlertCircle className="h-6 w-6 text-resend-red" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Recent Sync Errors</p>
              <h3 className="text-2xl font-bold text-foreground">{recentErrors}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="sync">Sync Activity</TabsTrigger>
          <TabsTrigger value="close-books">Close Books</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-6">
              <Card className="glass-card border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <ArrowRightLeft className="w-5 h-5 mr-2 text-brand" />
                    Connected Systems
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingIntegrations ? (
                    <p className="text-sm text-muted-foreground">Loading integrations...</p>
                  ) : integrations.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-border/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-4">No integrations connected.</p>
                      <button className="px-4 py-2 bg-brand text-black font-semibold rounded-lg hover:opacity-90 transition-opacity">
                        Connect Quickbooks
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {integrations.map(integration => (
                        <div key={integration.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${integration.is_active ? 'bg-resend-green' : 'bg-muted-foreground'}`} />
                            <span className="font-medium capitalize">{integration.provider}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(integration.connected_at), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="glass-card border-border/50 shadow-sm h-full">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Sync Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingLogs ? (
                    <p className="text-muted-foreground text-sm">Loading logs...</p>
                  ) : logs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No sync activity recorded yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.slice(0, 10).map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(log.created_at), 'MMM dd, HH:mm')}
                            </TableCell>
                            <TableCell className="capitalize">{log.entity_type}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                log.sync_status === 'success' ? 'bg-resend-green/10 text-resend-green' : 
                                log.sync_status === 'failed' ? 'bg-resend-red/10 text-resend-red' : 
                                'bg-resend-yellow/10 text-resend-yellow'
                              }`}>
                                {log.sync_status}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {log.error_message || 'Synced successfully'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="close-books" className="space-y-6">
          <Card className="border-rose-100 shadow-sm overflow-hidden bg-rose-50/30">
            <CardHeader className="bg-rose-50 border-b border-rose-100">
              <CardTitle className="flex items-center text-rose-900">
                <Lock className="w-5 h-5 mr-2 text-rose-600" />
                Audit-Ready Books
              </CardTitle>
              <CardDescription className="text-rose-700/80">
                Lock historical data to prevent retroactive changes from affecting your accounting sync.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
                <div className="space-y-4 max-w-xl">
                  <p className="text-sm text-muted-foreground">
                    Closing a period will lock all invoices, inventory counts, and waste logs prior to the end date. This ensures that what is exported to QuickBooks or Sage Intacct perfectly matches the data in MEVS, ensuring full enterprise audit readiness.
                  </p>
                  <Button onClick={() => setCloseDialogOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20">
                    <Calendar className="w-4 h-4 mr-2" />
                    Close Current Period
                  </Button>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="font-medium text-sm mb-4 text-foreground flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                  Closed Periods History
                </h3>
                {loadingPeriods ? (
                  <p className="text-sm text-muted-foreground">Loading closed periods...</p>
                ) : closedPeriods.length === 0 ? (
                  <div className="p-4 border rounded bg-white text-sm text-muted-foreground">No periods have been closed yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period Name</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Closed At</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedPeriods.map(period => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium text-slate-900">{period.period_name}</TableCell>
                          <TableCell>{period.start_date}</TableCell>
                          <TableCell>{period.end_date}</TableCell>
                          <TableCell>{format(new Date(period.closed_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                          <TableCell className="text-muted-foreground">{period.notes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Accounting Period</DialogTitle>
            <DialogDescription>
              Are you sure you want to close the current period? This will lock all operational records prior to today.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-sm font-medium">
            This action cannot be undone by store-level staff. It requires an Administrator to unlock.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button disabled={isClosing} onClick={handleClosePeriod} className="bg-rose-600 hover:bg-rose-700 text-white">
              {isClosing ? 'Closing...' : 'Confirm Close Books'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
