import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, DownloadCloud, AlertTriangle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Papa from 'papaparse';
import { api } from '@/lib/apiClient';

export default function POSSyncEngine({ inventory, recipes, updateInventoryMutation }) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [pmix, setPmix] = useState(null);
  const [depletionPreview, setDepletionPreview] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSimulating(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData = results.data;
        const mockSales = [];
        const mockDepletion = {};

        // Assume CSV has columns: "Menu Item", "Qty Sold"
        parsedData.forEach(row => {
          const name = row['Menu Item'] || row['name'] || row['Item Name'];
          const qtyString = row['Qty Sold'] || row['qty'] || row['Quantity'];
          const qtySold = parseInt(qtyString, 10);

          if (name && qtySold > 0) {
            // Find recipe matching the name
            const recipe = recipes.find(r => r.name?.toLowerCase().trim() === name.toLowerCase().trim());
            if (recipe) {
              mockSales.push({ recipe_id: recipe.id, name: recipe.name, qty: qtySold });

              // Calculate ingredient usage
              if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
                recipe.ingredients.forEach(ing => {
                  const totalUsed = (ing.quantity || 0) * qtySold;
                  if (totalUsed > 0) {
                    if (!mockDepletion[ing.product_id]) {
                      mockDepletion[ing.product_id] = {
                        product_id: ing.product_id,
                        product_name: ing.name || 'Unknown Item',
                        total_used: 0,
                        unit: ing.unit || 'ea'
                      };
                    }
                    mockDepletion[ing.product_id].total_used += totalUsed;
                  }
                });
              }
            }
          }
        });

        if (mockSales.length === 0) {
          toast.error("No matching menu items found in the CSV against your recipes.");
          setIsSimulating(false);
          return;
        }

        setPmix(mockSales.sort((a, b) => b.qty - a.qty));
        setDepletionPreview(Object.values(mockDepletion).sort((a, b) => b.total_used - a.total_used));
        setIsSimulating(false);
        toast.success(`POS Sales Sync Complete: Imported ${mockSales.length} mapped items`);
      },
      error: (err) => {
        toast.error("Failed to parse CSV file");
        setIsSimulating(false);
      }
    });
  };

  const processDepletion = async () => {
    if (!depletionPreview || depletionPreview.length === 0) return;

    // Loop through depletion and update inventory
    let successCount = 0;
    
    for (const item of depletionPreview) {
      const invRecord = inventory.find(i => i.product_id === item.product_id);
      if (invRecord) {
        const newQty = Math.max(0, (invRecord.current_quantity || 0) - item.total_used);
        
        // Push update to DB
        await updateInventoryMutation.mutateAsync({
          id: invRecord.id,
          data: {
            current_quantity: newQty,
            previous_quantity: invRecord.current_quantity,
          }
        });
        successCount++;
      }
    }

    toast.success(`Inventory Depleted: Updated ${successCount} items based on theoretical usage.`);
    setPmix(null);
    setDepletionPreview(null);
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 via-white to-blue-50">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <DownloadCloud className="h-6 w-6 text-indigo-600" />
            End of Day POS Sync
          </CardTitle>
          <CardDescription>
            Import your daily Product Mix (PMIX) from your POS to automatically calculate theoretical inventory depletion based on your recipes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pmix ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center flex flex-col items-center justify-center bg-white">
               <DownloadCloud className="h-12 w-12 text-indigo-300 mb-4" />
               <h3 className="text-lg font-medium mb-2">Upload POS PMIX Report</h3>
               <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                 Export your daily PMIX from Toast, Aloha, or Square as a CSV and upload it here to calculate theoretical depletion.
               </p>
               <div className="relative">
                 <Input 
                   type="file" 
                   accept=".csv"
                   onChange={handleFileUpload}
                   disabled={isSimulating || recipes.length === 0}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <Button 
                   disabled={isSimulating || recipes.length === 0}
                   className="bg-indigo-600 hover:bg-indigo-700 text-white pointer-events-none"
                 >
                   {isSimulating ? (
                     <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing Data...</>
                   ) : (
                     "Select CSV File"
                   )}
                 </Button>
               </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white p-4 rounded-lg border">
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
                <Card className="shadow-none">
                  <CardHeader className="py-3 bg-secondary/50">
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
                          <TableRow key={item.recipe_id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right font-bold text-indigo-600">{item.qty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Depletion Table */}
                <Card className="shadow-none">
                  <CardHeader className="py-3 bg-secondary/50">
                    <CardTitle className="text-sm font-semibold flex justify-between">
                      <span>Theoretical Depletion</span>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Pending</Badge>
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
