import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Zap } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';

export default function JustPayVendorDialog({ open, onOpenChange }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [formData, setFormData] = useState({
    vendor_id: '',
    amount: '',
    payment_method: 'check',
    memo: ''
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', organization?.id],
    queryFn: () => api.entities.Vendor.filter({ organization_id: organization?.id }),
    enabled: !!organization?.id && open,
  });

  const handleSubmit = async () => {
    if (!formData.vendor_id || !formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error("Please select a vendor and enter a valid amount.");
      return;
    }

    setIsProcessing(true);
    try {
      // This records a payment already made outside the app (a check you already mailed, a
      // wire you already sent) -- it does not move money itself. There is no in-app rail here
      // for arbitrary vendor payments with no invoice; process-payout/process-checkbook-payout
      // both require a real invoice_id. Use "Bulk Vendor Payouts" or an invoice's "Release
      // Funds" button for an actual Dwolla/Checkbook.io transfer.
      await api.financial.recordAdHocVendorPayment({
        vendorId: formData.vendor_id,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.payment_method,
        memo: formData.memo || null,
        idempotencyKey: `AD-HOC-${organization?.id}-${formData.vendor_id}-${formData.amount}-${Date.now()}`,
      });

      toast.success(`Recorded a $${formData.amount} payment to this vendor.`);
      onOpenChange(false);

      // Reset form
      setFormData({ vendor_id: '', amount: '', payment_method: 'check', memo: '' });
      queryClient.invalidateQueries({ queryKey: ['accounting-payments'] });

    } catch (e) {
      toast.error("Failed to record payment: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-resend-yellow" />
            Record Manual Payment
          </DialogTitle>
          <DialogDescription>
            Log a payment you already sent to this vendor outside the app. This does not send money -- for a real Dwolla/Checkbook.io transfer, use Bulk Vendor Payouts or an invoice's Release Funds button.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select value={formData.vendor_id} onValueChange={(val) => setFormData(prev => ({...prev, vendor_id: val}))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input 
              type="number" 
              placeholder="0.00" 
              step="0.01" 
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({...prev, amount: e.target.value}))}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={formData.payment_method} onValueChange={(val) => setFormData(prev => ({...prev, payment_method: val}))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="wire">Wire</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Internal Memo (Optional)</Label>
            <Input 
              placeholder="e.g. Rush order deposit" 
              value={formData.memo}
              onChange={(e) => setFormData(prev => ({...prev, memo: e.target.value}))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            className="bg-resend-yellow hover:bg-resend-yellow/90 text-yellow-950" 
            onClick={handleSubmit}
            disabled={isProcessing || !formData.vendor_id || !formData.amount}
          >
            {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</> : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

