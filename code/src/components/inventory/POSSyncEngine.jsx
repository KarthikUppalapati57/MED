import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, DownloadCloud, AlertTriangle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from '@/lib/apiClient';

export default function POSSyncEngine({ inventory, recipes, updateInventoryMutation }) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [pmix, setPmix] = useState(null);
  const [depletionPreview, setDepletionPreview] = useState(null);

  // Simulate pulling sales data from POS (e.g., Toast)
  const generateMockPMIX = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const mockSales = [];
      const mockDepletion = {};

      recipes.forEach(recipe => {
        // Randomly sell 0 to 50 of each recipe
        const qtySold = Math.floor(Math.random() * 50);
        if (qtySold > 0) {
          mockSales.push({ recipe_id: recipe.id, name: recipe.name, qty: qtySold });

          // Calculate ingredient usage
          if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
            recipe.ingredients.forEach(ing => {
              // ing has product_id, quantity (used per recipe)
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
      });

      setPmix(mockSales.sort((a, b) => b.qty - a.qty));
      setDepletionPreview(Object.values(mockDepletion).sort((a, b) => b.total_used - a.total_used));
      setIsSimulating(false);
      toast.success("POS Sales Sync Complete: 1 Day of Sales Imported");
    }, 1500);
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
            <Button 
              onClick={generateMockPMIX} 
              disabled={isSimulating || recipes.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSimulating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching POS Data...</>
              ) : (
                <><DownloadCloud className="h-4 w-4 mr-2" /> Run EOD Sales Sync</>
              )}
            </Button>
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
