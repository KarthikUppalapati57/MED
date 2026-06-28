import React, { useState, useMemo } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, DollarSign, TrendingDown, TrendingUp, Users, ShoppingCart } from 'lucide-react';

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const sameDate = (value, target) => {
  if (!value || !target) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === target;
};

export default function DailyPnLTab() {
  const { organization, brand, location } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: rawSalesData } = useAuthQuery({
    queryKey: ['pos_sales_data', organization?.id],
    queryFn: () => api.entities.PosSalesData.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: rawInvoices } = useAuthQuery({
    queryKey: ['invoices', organization?.id],
    queryFn: () => api.entities.Invoice.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: rawShifts } = useAuthQuery({
    queryKey: ['employee_shifts', organization?.id],
    queryFn: () => api.entities.EmployeeShift.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const pnlData = useMemo(() => {
    const sales = (rawSalesData || []).reduce((sum, record) => {
      const d = record.sale_date || record.date || record.created_at;
      return sameDate(d, selectedDate) ? sum + Number(record.revenue || record.total_sales || 0) : sum;
    }, 0);

    const cogs = (rawInvoices || []).reduce((sum, inv) => {
      const d = inv.invoice_date || inv.created_at;
      return sameDate(d, selectedDate) ? sum + Number(inv.total_amount || 0) : sum;
    }, 0);

    const labor = (rawShifts || []).reduce((sum, shift) => {
      const d = shift.shift_date || shift.start_time;
      return sameDate(d, selectedDate) ? sum + Number(shift.labor_cost || 0) : sum;
    }, 0);

    const primeCost = cogs + labor;
    // Assuming a fixed 20% for fixed costs/controllables to give a Net Operating Estimate
    const fixedCostsEstimate = sales * 0.20; 
    const netOperatingEstimate = sales - primeCost - fixedCostsEstimate;

    const cogsPct = sales > 0 ? (cogs / sales) * 100 : 0;
    const laborPct = sales > 0 ? (labor / sales) * 100 : 0;
    const primeCostPct = sales > 0 ? (primeCost / sales) * 100 : 0;
    const netPct = sales > 0 ? (netOperatingEstimate / sales) * 100 : 0;

    return {
      sales,
      cogs,
      cogsPct,
      labor,
      laborPct,
      primeCost,
      primeCostPct,
      fixedCostsEstimate,
      netOperatingEstimate,
      netPct
    };
  }, [rawSalesData, rawInvoices, rawShifts, selectedDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" /> Real-Time Daily P&L
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Get an instant heartbeat of your daily prime costs and net operating estimates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Gross Sales</h3>
              <div className="p-2 bg-indigo-100 rounded text-indigo-700">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold">{money(pnlData.sales)}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Estimated COGS</h3>
              <div className="p-2 bg-amber-100 rounded text-amber-700">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold">{money(pnlData.cogs)}</p>
            <p className="text-sm text-muted-foreground mt-1">{pct(pnlData.cogsPct)} of sales</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Labor Cost</h3>
              <div className="p-2 bg-blue-100 rounded text-blue-700">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold">{money(pnlData.labor)}</p>
            <p className="text-sm text-muted-foreground mt-1">{pct(pnlData.laborPct)} of sales</p>
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-sm ${pnlData.netOperatingEstimate < 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-muted-foreground">Net Operating Est.</h3>
              <div className={`p-2 rounded ${pnlData.netOperatingEstimate < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {pnlData.netOperatingEstimate < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              </div>
            </div>
            <p className={`text-3xl font-bold ${pnlData.netOperatingEstimate < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {money(pnlData.netOperatingEstimate)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{pct(pnlData.netPct)} margin</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Daily Income Statement Breakdown</CardTitle>
          <CardDescription>A simplified view of today's estimated financial performance.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">% of Sales</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/10">
                <TableCell className="font-bold">Total Sales</TableCell>
                <TableCell className="text-right font-bold">{money(pnlData.sales)}</TableCell>
                <TableCell className="text-right">100.0%</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right"></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6">Cost of Goods Sold (COGS)</TableCell>
                <TableCell className="text-right text-amber-700">{money(pnlData.cogs)}</TableCell>
                <TableCell className="text-right">{pct(pnlData.cogsPct)}</TableCell>
                <TableCell className="text-right text-muted-foreground">~30.0%</TableCell>
                <TableCell className="text-right">
                  {pnlData.cogsPct > 30 ? <Badge variant="destructive" className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-none">High</Badge> : <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-none hover:bg-emerald-50">Good</Badge>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6">Labor Cost</TableCell>
                <TableCell className="text-right text-blue-700">{money(pnlData.labor)}</TableCell>
                <TableCell className="text-right">{pct(pnlData.laborPct)}</TableCell>
                <TableCell className="text-right text-muted-foreground">~25.0%</TableCell>
                <TableCell className="text-right">
                  {pnlData.laborPct > 25 ? <Badge variant="destructive" className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-none">High</Badge> : <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-none hover:bg-emerald-50">Good</Badge>}
                </TableCell>
              </TableRow>
              <TableRow className="bg-slate-50 border-y-2 border-slate-200">
                <TableCell className="font-bold">Prime Cost</TableCell>
                <TableCell className="text-right font-bold">{money(pnlData.primeCost)}</TableCell>
                <TableCell className="text-right font-bold">{pct(pnlData.primeCostPct)}</TableCell>
                <TableCell className="text-right text-muted-foreground font-medium">&lt; 55.0%</TableCell>
                <TableCell className="text-right">
                  {pnlData.primeCostPct > 55 ? <Badge variant="destructive" className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-none">Needs Attention</Badge> : <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-none hover:bg-emerald-50">On Target</Badge>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6 text-muted-foreground">Fixed / Controllable Est.</TableCell>
                <TableCell className="text-right text-muted-foreground">{money(pnlData.fixedCostsEstimate)}</TableCell>
                <TableCell className="text-right text-muted-foreground">20.0%</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right"></TableCell>
              </TableRow>
              <TableRow className={pnlData.netOperatingEstimate < 0 ? 'bg-rose-50' : 'bg-emerald-50'}>
                <TableCell className="font-bold">Net Operating Estimate</TableCell>
                <TableCell className={`text-right font-bold ${pnlData.netOperatingEstimate < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {money(pnlData.netOperatingEstimate)}
                </TableCell>
                <TableCell className={`text-right font-bold ${pnlData.netOperatingEstimate < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {pct(pnlData.netPct)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground font-medium">&gt; 15.0%</TableCell>
                <TableCell className="text-right"></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
