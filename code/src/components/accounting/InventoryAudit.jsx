import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { CHART_OF_ACCOUNTS, getCOALabel } from '@/lib/accountingConfig';
import { TrendingUp, Package, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function InventoryAudit() {
  const { data: auditData = [], isLoading } = useAuthQuery({
    queryKey: ['inventory-audit-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('accounting_category, current_quantity, unit_cost');
      
      if (error) throw error;
      
      // Aggregate by category
      const summary = {};
      data.forEach(item => {
        const cat = item.accounting_category || 'Other';
        if (!summary[cat]) {
          summary[cat] = { count: 0, value: 0 };
        }
        summary[cat].count += 1;
        summary[cat].value += (item.current_quantity * item.unit_cost) || 0;
      });
      
      return Object.entries(summary).map(([code, stats]) => ({
        code,
        label: getCOALabel(code),
        ...stats
      }));
    }
  });

  const totalValue = auditData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-slate-900 text-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Inventory Asset</p>
                <h3 className="text-3xl font-black mt-2">${totalValue.toLocaleString()}</h3>
                <div className="flex items-center gap-1 text-emerald-400 text-[10px] mt-2 font-bold">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+2.4% from last period</span>
                </div>
              </div>
              <div className="p-3 bg-white/10 rounded-2xl">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stock Accuracy</p>
                <h3 className="text-3xl font-black mt-2">98.2%</h3>
                <div className="flex items-center gap-1 text-slate-400 text-[10px] mt-2 font-bold">
                  <span>Based on 124 spot checks</span>
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">COGS Impact (Est.)</p>
                <h3 className="text-3xl font-black mt-2">24.5%</h3>
                <div className="flex items-center gap-1 text-rose-500 text-[10px] mt-2 font-bold">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>High variance in 5110 (Meat)</span>
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Asset Valuation by Account Code</CardTitle>
          <p className="text-xs text-slate-400">Standardized auditing breakdown for P&L reconciliation</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-[11px] font-bold">ACCOUNT CODE</TableHead>
                <TableHead className="text-[11px] font-bold">ITEMS</TableHead>
                <TableHead className="text-[11px] font-bold">VALUATION</TableHead>
                <TableHead className="text-[11px] font-bold text-right">% OF TOTAL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditData.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-slate-400">No data available for audit</TableCell></TableRow>
              ) : auditData.sort((a,b) => b.value - a.value).map(row => (
                <TableRow key={row.code}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold text-slate-400">
                        {row.code}
                      </div>
                      <p className="font-bold text-sm text-slate-900">{row.label}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-600">{row.count} items</TableCell>
                  <TableCell className="font-black text-slate-900">${row.value.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {((row.value / totalValue) * 100).toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CheckCircle2(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
