import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';

export function DailyPOSSyncReview() {
  const { organization, location } = useAuth();
  const [open, setOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: usageData, isLoading, refetch } = useAuthQuery({
    queryKey: ['daily_pos_usage', organization?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('generate_daily_theoretical_usage', {
        p_org_id: organization?.id,
        p_date: today
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && open
  });

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const { data, error } = await supabase.rpc('approve_daily_pos_usage', {
        p_org_id: organization?.id,
        p_date: today,
        p_location_id: location?.id || null, // Assuming first location if null for MVP
        p_user_id: (await supabase.auth.getUser()).data.user?.id
      });
      if (error) throw error;
      
      toast.success(data?.message || "Inventory successfully depleted based on today's POS sales.");
      setOpen(false);
    } catch (err) {
      toast.error(err.message || "Failed to approve POS sync");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <>
      <Button 
        onClick={() => setOpen(true)}
        className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20"
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        End of Day POS Sync
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-500" />
              Daily POS Usage Review
            </DialogTitle>
            <DialogDescription>
              Review the theoretical ingredient usage generated from today's POS sales. 
              Approving this will permanently deduct these quantities from your physical inventory levels.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto mt-4 rounded-xl border border-border bg-card">
            <Table>
              <TableHeader className="bg-secondary/50 sticky top-0">
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead className="text-right">Theoretical Usage</TableHead>
                  <TableHead className="text-right">Cost Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Calculating usage from POS ledgers...
                    </TableCell>
                  </TableRow>
                ) : usageData?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
                      No POS sales recorded for today yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  usageData?.map(item => (
                    <TableRow key={item.ingredient_id}>
                      <TableCell className="font-medium">{item.ingredient_name}</TableCell>
                      <TableCell className="text-right font-bold text-rose-600">
                        -{Number(item.theoretical_usage).toFixed(2)} {item.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ${Number(item.cost_value).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleApprove} 
              disabled={isApproving || !usageData?.length}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isApproving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Approve & Deplete Inventory
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
