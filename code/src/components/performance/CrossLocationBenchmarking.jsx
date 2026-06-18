import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Download, Medal, Settings2, Sparkles } from "lucide-react";
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { format, subDays } from 'date-fns';
import { toast } from "sonner";

export default function CrossLocationBenchmarking() {
  const { organization } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Custom manual weights for scoring
  const [cogsWeight, setCogsWeight] = useState(50);
  const [laborWeight, setLaborWeight] = useState(50);

  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const endDate = format(new Date(), 'yyyy-MM-dd');

  const { data: benchmarkData = [], refetch, isLoading } = useAuthQuery({
    queryKey: ['location_benchmarks', organization?.id, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_location_benchmarks', {
        p_organization_id: organization?.id,
        p_start_date: startDate,
        p_end_date: endDate
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success("Benchmarks updated");
  };

  const processedData = useMemo(() => {
    return benchmarkData.map(loc => {
      const rev = Number(loc.total_revenue) || 0;
      const cogs = Number(loc.total_cogs) || 0;
      const labor = Number(loc.total_labor) || 0;
      
      const cogsPct = rev > 0 ? (cogs / rev) * 100 : 0;
      const laborPct = rev > 0 ? (labor / rev) * 100 : 0;
      const primePct = rev > 0 ? ((cogs + labor) / rev) * 100 : 0;

      // Score calculation: 
      // Lower is better for COGS and Labor. We penalize higher percentages based on weights.
      // Base score is 100. We subtract the weighted percentages.
      // E.g., if COGS is 30% and Weight is 50, penalty is 30 * (50/100) = 15 points.
      const cogsPenalty = cogsPct * (cogsWeight / 100);
      const laborPenalty = laborPct * (laborWeight / 100);
      const score = Math.max(0, 100 - (cogsPenalty + laborPenalty));

      return {
        ...loc,
        rev,
        cogs,
        labor,
        cogsPct,
        laborPct,
        primePct,
        score
      };
    }).sort((a, b) => b.score - a.score);
  }, [benchmarkData, cogsWeight, laborWeight]);

  const handleExportCSV = async () => {
    if (!processedData || processedData.length === 0) return toast.error("No data to export");
    const exportData = processedData.map(d => ({
      Location: d.location_name,
      Revenue: d.rev.toFixed(2),
      'COGS %': d.cogsPct.toFixed(1),
      'Labor %': d.laborPct.toFixed(1),
      'Prime Cost %': d.primePct.toFixed(1),
      'Score': d.score.toFixed(1)
    }));
    const { exportToCSV } = await import('@/lib/exportUtils');
    exportToCSV(exportData, `cross-location-benchmarks-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleExportPDF = async () => {
    if (!processedData || processedData.length === 0) return toast.error("No data to export");
    const columns = [
      { header: 'Location', dataKey: 'Location' },
      { header: 'Revenue ($)', dataKey: 'Revenue' },
      { header: 'COGS %', dataKey: 'COGS %' },
      { header: 'Labor %', dataKey: 'Labor %' },
      { header: 'Prime Cost %', dataKey: 'Prime Cost %' },
      { header: 'Score', dataKey: 'Score' }
    ];
    const data = processedData.map(d => ({
      Location: d.location_name,
      Revenue: d.rev.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      'COGS %': d.cogsPct.toFixed(1) + '%',
      'Labor %': d.laborPct.toFixed(1) + '%',
      'Prime Cost %': d.primePct.toFixed(1) + '%',
      'Score': d.score.toFixed(1)
    }));
    const { exportToPDF } = await import('@/lib/exportUtils');
    exportToPDF(columns, data, 'Cross-Location Benchmarks', `cross-location-benchmarks-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cross-Location Benchmarking</h2>
          <p className="text-muted-foreground mt-1">Compare performance and rank locations based on customizable weights (Last 30 Days).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSettings(!showSettings)} className="bg-background">
            <Settings2 className="w-4 h-4 mr-2" />
            Weights
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button onClick={handleRefresh} disabled={isRefreshing || isLoading} className="bg-brand text-white hover:bg-brand/90">
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card className="bg-muted/30 border-dashed shadow-sm animate-in fade-in zoom-in duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Scoring Weights Configurator</CardTitle>
            <CardDescription className="text-xs">Adjust how much COGS vs Labor impacts the overall ranking score.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 items-center">
              <div className="flex-1 space-y-2">
                <Label>COGS Weight ({cogsWeight}%)</Label>
                <Input 
                  type="range" min="0" max="100" step="5" 
                  value={cogsWeight} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCogsWeight(val);
                    setLaborWeight(100 - val);
                  }}
                  className="w-full"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label>Labor Weight ({laborWeight}%)</Label>
                <Input 
                  type="range" min="0" max="100" step="5" 
                  value={laborWeight} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLaborWeight(val);
                    setCogsWeight(100 - val);
                  }}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-12 text-center font-bold">Rank</TableHead>
                <TableHead className="font-bold">Location</TableHead>
                <TableHead className="text-right font-bold">Revenue</TableHead>
                <TableHead className="text-right font-bold">COGS %</TableHead>
                <TableHead className="text-right font-bold">Labor %</TableHead>
                <TableHead className="text-right font-bold">Prime Cost %</TableHead>
                <TableHead className="text-right font-bold">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedData.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No location data found for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                processedData.map((loc, index) => {
                  let badge = null;
                  if (index === 0 && loc.score > 0) badge = <Medal className="w-5 h-5 text-amber-400 drop-shadow-sm" />;
                  else if (index === 1 && loc.score > 0) badge = <Medal className="w-5 h-5 text-slate-400 drop-shadow-sm" />;
                  else if (index === 2 && loc.score > 0) badge = <Medal className="w-5 h-5 text-amber-700 drop-shadow-sm" />;
                  
                  return (
                    <TableRow key={loc.location_id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="text-center font-medium">
                        {badge || <span className="text-muted-foreground">{index + 1}</span>}
                      </TableCell>
                      <TableCell className="font-bold">{loc.location_name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ${loc.rev.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={loc.cogsPct > 32 ? 'text-rose-600' : 'text-emerald-600'}>
                          {loc.cogsPct.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={loc.laborPct > 28 ? 'text-rose-600' : 'text-emerald-600'}>
                          {loc.laborPct.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        <span className={loc.primePct > 60 ? 'text-rose-600' : 'text-slate-900'}>
                          {loc.primePct.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-brand/10 text-brand hover:bg-brand/20 shadow-sm border border-brand/20">
                          {loc.score.toFixed(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
