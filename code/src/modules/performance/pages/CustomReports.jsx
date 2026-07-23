import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, CalendarClock, Download, FileText, Play, Save, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { exportToCSV } from '@/lib/exportUtils';
import { format, subDays } from 'date-fns';

const REPORT_MODULES = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'products', label: 'Products' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'performance', label: 'Performance' },
  { id: 'audit_logs', label: 'Audit Logs' },
];

const METRICS = [
  { id: 'invoice_count', label: 'Invoice Count', module: 'invoices', type: 'number' },
  { id: 'invoice_total_amount', label: 'Invoice Total', module: 'invoices', type: 'currency' },
  { id: 'invoice_approved_count', label: 'Approved Invoices', module: 'invoices', type: 'number' },
  { id: 'invoice_unpaid_count', label: 'Unpaid Invoices', module: 'invoices', type: 'number' },
  { id: 'invoice_tax_amount', label: 'Invoice Tax', module: 'invoices', type: 'currency' },
  { id: 'payment_count', label: 'Payment Count', module: 'payments', type: 'number' },
  { id: 'payment_amount', label: 'Payment Amount', module: 'payments', type: 'currency' },
  { id: 'payment_completed_amount', label: 'Completed Payments', module: 'payments', type: 'currency' },
  { id: 'payment_failed_count', label: 'Failed Payments', module: 'payments', type: 'number' },
  { id: 'product_count', label: 'Product Count', module: 'products', type: 'number' },
  { id: 'inventoried_product_count', label: 'Inventoried Products', module: 'products', type: 'number' },
  { id: 'avg_latest_price', label: 'Avg Latest Price', module: 'products', type: 'currency' },
  { id: 'products_with_price_count', label: 'Products with Price', module: 'products', type: 'number' },
  { id: 'inventory_value', label: 'Inventory Value', module: 'inventory', type: 'currency' },
  { id: 'inventory_quantity', label: 'Inventory Quantity', module: 'inventory', type: 'number' },
  { id: 'low_stock_count', label: 'Low Stock Items', module: 'inventory', type: 'number' },
  { id: 'inventory_waste', label: 'Inventory Waste', module: 'inventory', type: 'currency' },
  { id: 'cogs', label: 'COGS / Usage Cost', module: 'inventory', type: 'currency' },
  { id: 'recipe_count', label: 'Recipe Count', module: 'recipes', type: 'number' },
  { id: 'avg_recipe_cost', label: 'Avg Recipe Cost', module: 'recipes', type: 'currency' },
  { id: 'avg_suggested_price', label: 'Avg Suggested Price', module: 'recipes', type: 'currency' },
  { id: 'avg_cost_per_serving', label: 'Avg Cost per Serving', module: 'recipes', type: 'currency' },
  { id: 'sales_revenue', label: 'Sales Revenue', module: 'performance', type: 'currency' },
  { id: 'pos_transaction_count', label: 'POS Transactions', module: 'performance', type: 'number' },
  { id: 'labor_cost', label: 'Labor Cost', module: 'performance', type: 'currency' },
  { id: 'prime_cost', label: 'Prime Cost', module: 'performance', type: 'currency' },
  { id: 'gross_profit', label: 'Gross Profit', module: 'performance', type: 'currency' },
  { id: 'audit_event_count', label: 'Audit Events', module: 'audit_logs', type: 'number' },
  { id: 'audit_insert_count', label: 'Audit Inserts', module: 'audit_logs', type: 'number' },
  { id: 'audit_update_count', label: 'Audit Updates', module: 'audit_logs', type: 'number' },
  { id: 'audit_delete_count', label: 'Audit Deletes', module: 'audit_logs', type: 'number' },
];

const DIMENSIONS = [
  { id: 'date', label: 'Date' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'location', label: 'Location' },
  { id: 'status', label: 'Status / Action' },
  { id: 'category', label: 'Category / Table' },
  { id: 'module', label: 'Module' },
];

const SCHEDULES = [
  { id: 'none', label: 'Not scheduled', cron: null },
  { id: 'daily', label: 'Daily at 6 AM', cron: '0 6 * * *' },
  { id: 'weekly', label: 'Weekly Monday 6 AM', cron: '0 6 * * 1' },
  { id: 'monthly', label: 'Monthly on the 1st', cron: '0 6 1 * *' },
];

const DEFAULT_MODULES = REPORT_MODULES.map((item) => item.id);
const DEFAULT_METRICS = ['invoice_total_amount', 'payment_amount', 'inventory_value', 'sales_revenue'];
const DEFAULT_START_DATE = format(subDays(new Date(), 30), 'yyyy-MM-dd');
const DEFAULT_END_DATE = format(new Date(), 'yyyy-MM-dd');

const metricById = Object.fromEntries(METRICS.map((metric) => [metric.id, metric]));
const moduleById = Object.fromEntries(REPORT_MODULES.map((module) => [module.id, module]));

const formatMetricValue = (metricId, value) => {
  const numericValue = Number(value || 0);
  const metric = metricById[metricId];
  if (metric?.type === 'currency') {
    return numericValue.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }
  return numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const scheduleIdFromCron = (cron) => SCHEDULES.find((schedule) => schedule.cron === cron)?.id || 'none';
const cronFromScheduleId = (scheduleId) => SCHEDULES.find((schedule) => schedule.id === scheduleId)?.cron || null;

export default function CustomReports() {
  const { organization, userProfile } = useAuth();
  const [activeReportId, setActiveReportId] = useState(null);
  const [reportName, setReportName] = useState('Untitled Report');
  const [selectedModules, setSelectedModules] = useState(DEFAULT_MODULES);
  const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_METRICS);
  const [selectedDimension, setSelectedDimension] = useState('date');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [scheduleId, setScheduleId] = useState('none');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);

  const { data: savedReports = [], refetch } = useAuthQuery({
    queryKey: ['custom_reports'],
    queryFn: async () => {
      const { data, error } = await supabase.from('custom_reports').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const visibleMetrics = useMemo(
    () => METRICS.filter((metric) => selectedModules.includes(metric.module)),
    [selectedModules]
  );

  const toggleModule = (moduleId) => {
    setSelectedModules((prev) => {
      const next = prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId];
      setSelectedMetrics((metrics) => metrics.filter((metricId) => next.includes(metricById[metricId]?.module)));
      return next;
    });
  };

  const toggleMetric = (metricId) => {
    setSelectedMetrics((prev) => prev.includes(metricId) ? prev.filter((id) => id !== metricId) : [...prev, metricId]);
  };

  const resetBuilder = () => {
    setActiveReportId(null);
    setReportName('Untitled Report');
    setSelectedModules(DEFAULT_MODULES);
    setSelectedMetrics(DEFAULT_METRICS);
    setSelectedDimension('date');
    setStartDate(DEFAULT_START_DATE);
    setEndDate(DEFAULT_END_DATE);
    setScheduleId('none');
    setReportData(null);
  };

  const handleRunReport = async ({ metrics = selectedMetrics, dimension = selectedDimension, modules = selectedModules, from = startDate, to = endDate } = {}) => {
    if (modules.length === 0) return toast.error('Select at least one module.');
    if (metrics.length === 0) return toast.error('Select at least one metric.');
    if (from && to && from > to) return toast.error('Start date must be before end date.');

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.rpc('run_custom_report', {
        p_metrics: metrics,
        p_dimension: dimension,
        p_start_date: from || null,
        p_end_date: to || null,
        p_modules: modules,
      });

      if (error) throw error;

      setReportData(Array.isArray(data) ? data : []);
      toast.success(data?.length ? 'Report generated successfully' : 'Report ran with no matching data');
    } catch (err) {
      toast.error('Failed to generate report: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadReport = (report) => {
    const config = report.query_config || {};
    const modules = config.modules?.length ? config.modules : DEFAULT_MODULES;
    const metrics = (config.metrics || []).filter((metricId) => metricById[metricId]);
    const dimension = config.dimension || 'date';
    const from = config.start_date || DEFAULT_START_DATE;
    const to = config.end_date || DEFAULT_END_DATE;

    setActiveReportId(report.id);
    setReportName(report.name);
    setSelectedModules(modules);
    setSelectedMetrics(metrics.length ? metrics : DEFAULT_METRICS.filter((metricId) => modules.includes(metricById[metricId]?.module)));
    setSelectedDimension(dimension);
    setStartDate(from);
    setEndDate(to);
    setScheduleId(scheduleIdFromCron(report.schedule_cron));
    setReportData(null);
    handleRunReport({ metrics: metrics.length ? metrics : DEFAULT_METRICS, dimension, modules, from, to });
  };

  const handleExportReport = () => {
    if (!reportData || reportData.length === 0) return toast.error('No data to export');
    const dimensionLabel = DIMENSIONS.find((dimension) => dimension.id === selectedDimension)?.label || selectedDimension;
    const exportRows = reportData.map((row) => {
      const flat = {
        Module: moduleById[row.module]?.label || row.module,
        [dimensionLabel]: row.dimension,
      };
      selectedMetrics.forEach((metricId) => {
        flat[metricById[metricId]?.label || metricId] = row[metricId] ?? 0;
      });
      return flat;
    });
    exportToCSV(exportRows, `${reportName || 'custom-report'}-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleSaveReport = async () => {
    if (!reportName.trim()) return toast.error('Report requires a name');
    if (!organization?.id) return toast.error('Organization context is required');
    if (selectedModules.length === 0 || selectedMetrics.length === 0) return toast.error('Select modules and metrics before saving');

    const payload = {
      organization_id: organization.id,
      name: reportName.trim(),
      query_config: {
        modules: selectedModules,
        metrics: selectedMetrics,
        dimension: selectedDimension,
        start_date: startDate || null,
        end_date: endDate || null,
      },
      schedule_cron: cronFromScheduleId(scheduleId),
      created_by: userProfile?.id || null,
    };

    try {
      const query = activeReportId
        ? supabase.from('custom_reports').update(payload).eq('id', activeReportId)
        : supabase.from('custom_reports').insert([payload]).select('id').single();
      const { data, error } = await query;
      if (error) throw error;
      if (!activeReportId && data?.id) setActiveReportId(data.id);
      toast.success(activeReportId ? 'Report updated' : 'Report saved');
      refetch();
    } catch (err) {
      toast.error('Failed to save report: ' + err.message);
    }
  };

  return (
    <div className="p-6 space-y-8 min-h-screen bg-slate-50 dark:bg-slate-900/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Custom Report Builder</h1>
            <p className="text-muted-foreground mt-1">Build cross-module reports for invoices, payments, products, inventory, recipes, performance, and audit logs.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={resetBuilder}>
          <Plus className="w-4 h-4 mr-2" /> New Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Report Scope</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-semibold mb-2 block">Modules</Label>
                <div className="space-y-2">
                  {REPORT_MODULES.map((module) => {
                    const isSelected = selectedModules.includes(module.id);
                    return (
                      <button
                        key={module.id}
                        type="button"
                        onClick={() => toggleModule(module.id)}
                        className={`w-full p-2.5 rounded-lg border text-left text-sm transition-all flex items-center justify-between ${
                          isSelected ? 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400 font-medium' : 'bg-card hover:bg-secondary/50 text-muted-foreground'
                        }`}
                      >
                        {module.label}
                        {isSelected && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold mb-2 block">Group By</Label>
                <Select value={selectedDimension} onValueChange={setSelectedDimension}>
                  <SelectTrigger className="w-full bg-card">
                    <SelectValue placeholder="Select dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSIONS.map((dimension) => (
                      <SelectItem key={dimension.id} value={dimension.id}>{dimension.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold mb-2 block">Start</Label>
                  <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-semibold mb-2 block">End</Label>
                  <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold mb-2 block">Schedule</Label>
                <Select value={scheduleId} onValueChange={setScheduleId}>
                  <SelectTrigger className="w-full bg-card">
                    <SelectValue placeholder="Select schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULES.map((schedule) => (
                      <SelectItem key={schedule.id} value={schedule.id}>{schedule.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {REPORT_MODULES.filter((module) => selectedModules.includes(module.id)).map((module) => (
                  <div key={module.id} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">{module.label}</p>
                    {visibleMetrics.filter((metric) => metric.module === module.id).map((metric) => {
                      const isSelected = selectedMetrics.includes(metric.id);
                      return (
                        <button
                          key={metric.id}
                          type="button"
                          onClick={() => toggleMetric(metric.id)}
                          className={`w-full p-2.5 rounded-lg border text-left text-sm transition-all flex items-center justify-between ${
                            isSelected ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400 font-medium' : 'bg-card hover:bg-secondary/50 text-muted-foreground'
                          }`}
                        >
                          {metric.label}
                          {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Saved Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {savedReports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => handleLoadReport(report)}
                    className={`w-full flex items-center gap-2 text-sm p-2 rounded-lg text-left ${activeReportId === report.id ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'hover:bg-secondary'}`}
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate flex-1">{report.name}</span>
                    {report.schedule_cron && <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                ))}
                {savedReports.length === 0 && <p className="text-xs text-muted-foreground italic">No saved reports.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <Card className="border-border shadow-sm min-h-[560px] flex flex-col">
            <CardHeader className="border-b bg-secondary/30 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between py-3">
              <div className="flex items-center gap-3 flex-1 max-w-xl">
                <Input
                  value={reportName}
                  onChange={(event) => setReportName(event.target.value)}
                  className="font-bold text-lg border-transparent hover:border-input focus:border-input bg-transparent px-2"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveReport}>
                  <Save className="w-4 h-4 mr-2" /> {activeReportId ? 'Update' : 'Save'}
                </Button>
                <Button variant="outline" size="sm" disabled={!reportData || reportData.length === 0} onClick={handleExportReport}>
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
                <Button size="sm" onClick={() => handleRunReport()} disabled={isGenerating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isGenerating ? <span className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Run Query
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 bg-card overflow-hidden">
              {!reportData && !isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
                  <CalendarClock className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-medium">Report Canvas</p>
                  <p className="text-sm max-w-md mt-2">Choose modules, metrics, a date range, and grouping, then run the query to preview the report.</p>
                </div>
              ) : isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p>Processing report...</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[650px] p-6">
                  <Table>
                    <TableHeader className="bg-secondary/50 sticky top-0">
                      <TableRow>
                        <TableHead className="font-bold">Module</TableHead>
                        <TableHead className="font-bold">{DIMENSIONS.find((dimension) => dimension.id === selectedDimension)?.label}</TableHead>
                        {selectedMetrics.map((metricId) => (
                          <TableHead key={metricId} className="text-right font-bold">{metricById[metricId]?.label || metricId}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={selectedMetrics.length + 2} className="py-8 text-center text-muted-foreground">
                            No rows returned for the selected report.
                          </TableCell>
                        </TableRow>
                      ) : reportData.map((row, idx) => (
                        <TableRow key={`${row.module}-${row.dimension}-${idx}`}>
                          <TableCell className="font-medium whitespace-nowrap">{moduleById[row.module]?.label || row.module}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{row.dimension}</TableCell>
                          {selectedMetrics.map((metricId) => (
                            <TableCell key={metricId} className="text-right whitespace-nowrap">{formatMetricValue(metricId, row[metricId])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
