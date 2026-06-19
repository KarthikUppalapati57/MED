import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calculator, SplitSquareHorizontal, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { SplitCodingDialog } from './SplitCodingDialog';

export function CategorySummaryTable({ invoiceId, totalAmount = 0 }) {
  const queryClient = useQueryClient();
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState(null);

  // Fetch Allocations
  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ['invoice-allocations', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      return api.entities.InvoiceAllocation.filter(
        { invoice_id: invoiceId },
        { orderBy: 'allocation_type' }
      );
    },
    enabled: !!invoiceId
  });

  // Fetch GL Mappings for split dropdowns
  const { data: glMappings = [] } = useQuery({
    queryKey: ['gl-mappings'],
    queryFn: async () => {
      return api.entities.GlMapping.list();
    }
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.rpc('calculate_invoice_allocations', { p_invoice_id: invoiceId });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      toast.success("Allocations automatically calculated.");
      queryClient.invalidateQueries({ queryKey: ['invoice-allocations', invoiceId] });
    },
    onError: (err) => {
      toast.error("Failed to calculate allocations: " + err.message);
    }
  });

  const saveSplitsMutation = useMutation({
    mutationFn: async ({ originalAllocation, newSplits }) => {
      // Delete original
      await api.entities.InvoiceAllocation.delete(originalAllocation.id);

      // Insert new ones
      const toInsert = newSplits.map(s => ({
        invoice_id: invoiceId,
        organization_id: originalAllocation.organization_id,
        allocation_type: originalAllocation.allocation_type,
        category_name: s.category_name,
        gl_code: s.gl_code,
        amount: s.amount,
        percentage: s.percentage
      }));
      await Promise.all(toInsert.map((row) => api.entities.InvoiceAllocation.create(row)));
    },
    onSuccess: () => {
      toast.success("Split coding saved.");
      queryClient.invalidateQueries({ queryKey: ['invoice-allocations', invoiceId] });
    },
    onError: (err) => {
      toast.error("Failed to save splits: " + err.message);
    }
  });

  const allocatedTotal = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const uncategorizedAmount = Math.max(0, totalAmount - allocatedTotal);

  const openSplitDialog = (allocation) => {
    setSelectedAllocation(allocation);
    setSplitDialogOpen(true);
  };

  const handleSaveSplits = (splits) => {
    saveSplitsMutation.mutate({ originalAllocation: selectedAllocation, newSplits: splits });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5 text-teal-600" />
          Category & GL Summary
        </h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${calculateMutation.isPending ? 'animate-spin' : ''}`} />
          Auto-Calculate
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Category / GL Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                  No allocations generated yet. Click "Auto-Calculate" to pull from line items.
                </TableCell>
              </TableRow>
            ) : (
              allocations.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="capitalize">{a.allocation_type.replace('_', ' ')}</TableCell>
                  <TableCell>
                    {a.gl_code ? <span className="font-medium mr-2">{a.gl_code}</span> : null}
                    <span className="text-slate-600">{a.category_name || 'Uncategorized'}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">${(parseFloat(a.amount) || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openSplitDialog(a)} className="text-slate-500 hover:text-teal-600">
                      <SplitSquareHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end gap-6 text-sm">
        <div className="text-right">
          <p className="text-slate-500 font-medium">Allocated</p>
          <p className="font-semibold text-slate-900">${allocatedTotal.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-500 font-medium">Uncategorized</p>
          <p className={`font-semibold ${uncategorizedAmount > 0.05 ? 'text-amber-600' : 'text-slate-900'}`}>
            ${uncategorizedAmount.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-slate-500 font-medium">Invoice Total</p>
          <p className="font-semibold text-teal-700">${(parseFloat(totalAmount) || 0).toFixed(2)}</p>
        </div>
      </div>

      <SplitCodingDialog 
        open={splitDialogOpen} 
        onOpenChange={setSplitDialogOpen} 
        allocation={selectedAllocation}
        onSave={handleSaveSplits}
        glMappings={glMappings}
      />
    </div>
  );
}
