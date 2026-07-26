import React, { useState } from 'react';
import { Calculator, DownloadCloud, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Papa from 'papaparse';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirmation } from '@/hooks/useConfirmation';

export default function POSSyncEngine() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pmix, setPmix] = useState(null);
  const [depletionPreview, setDepletionPreview] = useState(null);
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const { confirm } = useConfirmation();

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const parsedData = results.data;
          const salesItems = [];

          parsedData.forEach(row => {
            const name = row['Menu Item'] || row['name'] || row['Item Name'];
            const qtyString = row['Qty Sold'] || row['qty'] || row['Quantity'];
            const qtySold = parseInt(qtyString, 10);

            if (name && qtySold > 0) {
              salesItems.push({ name, qty: qtySold });
            }
          });

          if (salesItems.length === 0) {
            toast.error("No valid sales data found in the CSV.");
            setIsProcessing(false);
            return;
          }

          // Offload intense joining and math to Postgres
          const { data, error } = await supabase.rpc('calculate_theoretical_depletion', {
            p_org_id: organization.id,
            p_sales_json: salesItems
          });

          if (error) throw error;

          setPmix(salesItems.sort((a, b) => b.qty - a.qty));
          setDepletionPreview(data || []);
          toast.success(`POS Sales Extracted: Matched natively via RPC`);
        } catch (err) {
          console.error(err);
          toast.error("Server-side depletion calculation failed.");
        } finally {
          setIsProcessing(false);
        }
      },
      error: (err) => {
        toast.error("Failed to parse CSV file");
        setIsProcessing(false);
      }
    });
  };

  const processDepletion = async () => {
    if (!depletionPreview || depletionPreview.length === 0) return;

    const proceed = await confirm({
      title: 'Process inventory depletion?',
      description: 'This will permanently deduct inventory levels based on theoretical usage and post GL entries. This action cannot be undone.',
      confirmText: 'Process Inventory Depletion',
      cancelText: 'Cancel',
      variant: 'destructive',
      severity: 'critical',
    });
    if (!proceed) return;

    try {
      const { error } = await supabase.rpc('execute_inventory_depletion', {
        p_org_id: organization.id,
        p_depletion_json: depletionPreview
      });
      
      if (error) throw error;

      toast.success(`Inventory Depleted based on theoretical usage.`);
      queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id] });
      setPmix(null);
      setDepletionPreview(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to execute native inventory depletion.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border shadow-sm bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/40 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2 text-foreground dark:text-slate-50">
            <DownloadCloud className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
            End of Day POS Sync
          </CardTitle>
          <CardDescription>
            Import your daily Product Mix (PMIX) from your POS to automatically calculate theoretical inventory depletion based on your recipes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pmix ? (
            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center flex flex-col items-center justify-center bg-card text-foreground dark:bg-slate-950/70 dark:text-slate-50 dark:border-slate-700">
               <DownloadCloud className="h-12 w-12 text-indigo-300 dark:text-indigo-400 mb-4" />
               <h3 className="text-lg font-medium mb-2">Upload POS PMIX Report</h3>
               <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                 Export your daily PMIX from Toast, Aloha, or Square as a CSV and upload it here to calculate theoretical depletion.
               </p>
               <div className="relative">
                 <Input 
                   type="file" 
                   accept=".csv"
                   onChange={handleFileUpload}
                   disabled={isProcessing}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <Button 
                   disabled={isProcessing}
                   className="bg-indigo-600 hover:bg-indigo-700 text-white pointer-events-none"
                 >
                   {isProcessing ? (
                     <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Native Processing...</>
                   ) : (
                     "Select CSV File"
                   )}
                 </Button>
               </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-card p-4 rounded-lg border text-foreground dark:bg-slate-950/70 dark:text-slate-50 dark:border-slate-800">
                <div>
                  <h3 className="font-semibold">Sync Successful</h3>
                  <p className="text-sm text-muted-foreground">Imported sales for {pmix.length} menu items.</p>
                </div>
                <Button 
                  onClick={processDepletion}
                  className="bg-resend-green hover:bg-resend-green/90 text-white"
                >
                  <Calculator className="h-4 w-4 mr-2" /> Process Inventory Depletion
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PMIX Table */}
                <Card className="shadow-none dark:border-slate-800">
                  <CardHeader className="py-3 bg-secondary/50 dark:bg-slate-900/80">
                    <CardTitle className="text-sm font-semibold">Product Mix (PMIX) Sold</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Menu Item</TableHead>
                          <TableHead className="text-right">Qty Sold</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pmix.map(item => (
                          <TableRow key={`${item.name}-${item.qty}`}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right font-bold text-indigo-600 dark:text-indigo-300">{item.qty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Depletion Table */}
                <Card className="shadow-none dark:border-slate-800">
                  <CardHeader className="py-3 bg-secondary/50 dark:bg-slate-900/80">
                    <CardTitle className="text-sm font-semibold flex justify-between">
                      <span>Theoretical Depletion</span>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-900">Pending</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead className="text-right">To Deduct</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {depletionPreview.map(item => (
                          <TableRow key={item.product_id}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell className="text-right text-resend-orange font-semibold">
                              -{item.total_used.toFixed(2)} {item.unit}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

