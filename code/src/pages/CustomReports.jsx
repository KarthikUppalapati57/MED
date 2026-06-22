import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, PieChartIcon, BarChart3, LineChart, FileText, Download, Play, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';

const METRICS = [
  { id: 'sales_revenue', label: 'Sales Revenue', category: 'Financials' },
  { id: 'cogs', label: 'Cost of Goods Sold (COGS)', category: 'Financials' },
  { id: 'labor_cost', label: 'Labor Cost', category: 'Financials' },
  { id: 'inventory_waste', label: 'Inventory Waste Value', category: 'Operations' },
  { id: 'pos_transaction_count', label: 'Transaction Count', category: 'Operations' },
];

const DIMENSIONS = [
  { id: 'date', label: 'Date (Daily)' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'location', label: 'Location' },
];

export default function CustomReports() {
  const { organization } = useAuth();
  const [reportName, setReportName] = useState('Untitled Report');
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedDimension, setSelectedDimension] = useState('date');
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

  const toggleMetric = (metricId) => {
    setSelectedMetrics(prev => 
      prev.includes(metricId) ? prev.filter(id => id !== metricId) : [...prev, metricId]
    );
  };

  const handleRunReport = async () => {
    if (selectedMetrics.length === 0) return toast.error("Please select at least one metric.");
    
    setIsGenerating(true);
    try {
      // In production, this would call a Supabase Edge Function to dynamically construct and execute the query
      // using the read-only replica, returning aggregated data.
      // For MVP, we simulate the return data based on selections.
      
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate query execution
      
      const mockData = Array.from({ length: 5 }).map((_, i) => {
        const row = { dimension: `Day ${i + 1}` };
        selectedMetrics.forEach(m => {
          row[m] = Math.floor(Math.random() * 5000) + 500; // Mock value
        });
        return row;
      });
      
      setReportData(mockData);
      toast.success("Report generated successfully");
    } catch (err) {
      toast.error("Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReport = async () => {
    if (!reportName) return toast.error("Report requires a name");
    try {
      const { error } = await supabase.from('custom_reports').insert([{
        organization_id: organization?.id,
        name: reportName,
        query_config: { metrics: selectedMetrics, dimension: selectedDimension }
      }]);
      
      if (error) throw error;
      toast.success("Report saved!");
      refetch();
    } catch (err) {
      toast.error("Failed to save report: " + err.message);
    }
  };

  return (
    <div className="p-6 space-y-8 min-h-screen bg-slate-50 dark:bg-slate-900/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Custom Report Builder</h1>
            <p className="text-muted-foreground mt-1">Design and schedule advanced analytics across your operations.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Sidebar: Data Selection */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Data Points</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              <div>
                <Label className="text-xs font-semibold mb-2 block">Group By (Dimension)</Label>
                <Select value={selectedDimension} onValueChange={setSelectedDimension}>
                  <SelectTrigger className="w-full bg-card">
                    <SelectValue placeholder="Select dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSIONS.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <Label className="text-xs font-semibold mb-2 block">Metrics (Select multiple)</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {METRICS.map(metric => {
                    const isSelected = selectedMetrics.includes(metric.id);
                    return (
                      <div 
                        key={metric.id}
                        onClick={() => toggleMetric(metric.id)}
                        className={`p-2.5 rounded-lg border cursor-pointer text-sm transition-all flex items-center justify-between ${
                          isSelected ? 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400 font-medium' : 'bg-card hover:bg-secondary/50 text-muted-foreground'
                        }`}
                      >
                        {metric.label}
                        {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>
                    )
                  })}
                </div>
              </div>

            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Saved Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {savedReports.map(report => (
                  <div key={report.id} className="flex items-center gap-2 text-sm p-2 hover:bg-secondary rounded-lg cursor-pointer">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{report.name}</span>
                  </div>
                ))}
                {savedReports.length === 0 && <p className="text-xs text-muted-foreground italic">No saved reports.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Canvas: Report Preview */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-border shadow-sm min-h-[500px] flex flex-col">
            <CardHeader className="border-b bg-secondary/30 flex flex-row items-center justify-between py-3">
              <div className="flex items-center gap-3 flex-1 max-w-sm">
                <Input 
                  value={reportName} 
                  onChange={e => setReportName(e.target.value)}
                  className="font-bold text-lg border-transparent hover:border-input focus:border-input bg-transparent px-2"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveReport}>
                  <Save className="w-4 h-4 mr-2" /> Save
                </Button>
                <Button variant="outline" size="sm" disabled={!reportData}>
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
                <Button size="sm" onClick={handleRunReport} disabled={isGenerating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isGenerating ? <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Run Query
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 bg-card overflow-hidden">
              {!reportData && !isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
                  <PieChartIcon className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-medium">Report Canvas</p>
                  <p className="text-sm max-w-md mt-2">Select dimensions and metrics from the left sidebar, then click "Run Query" to preview the results.</p>
                </div>
              ) : isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p>Processing large dataset...</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[600px] p-6">
                  <Table>
                    <TableHeader className="bg-secondary/50 sticky top-0">
                      <TableRow>
                        <TableHead className="font-bold">{DIMENSIONS.find(d => d.id === selectedDimension)?.label}</TableHead>
                        {selectedMetrics.map(mId => (
                          <TableHead key={mId} className="text-right font-bold">{METRICS.find(m => m.id === mId)?.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.dimension}</TableCell>
                          {selectedMetrics.map(mId => (
                            <TableCell key={mId} className="text-right">${row[mId].toLocaleString()}</TableCell>
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
