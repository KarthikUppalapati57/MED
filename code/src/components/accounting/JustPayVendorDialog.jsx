import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const { organization, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [formData, setFormData] = useState({
    vendor_id: '',
    amount: '',
    payment_method: 'stripe',
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
      // Simulate Payment API (Stripe/PayPal/Lob)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Drop into Ledger directly (no invoice_id)
      await api.entities.LedgerPayment.create({
        organization_id: organization?.id,
        vendor_id: formData.vendor_id,
        amount: parseFloat(formData.amount),
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: formData.payment_method,
        reference: `AD-HOC-${formData.payment_method.toUpperCase()}-${Date.now()}`,
        status: 'completed',
        created_by: userProfile?.id || null
      });

      toast.success(`Successfully sent $${formData.amount} to vendor via ${formData.payment_method}.`);
      onOpenChange(false);
      
      // Reset form
      setFormData({ vendor_id: '', amount: '', payment_method: 'stripe', memo: '' });
      queryClient.invalidateQueries({ queryKey: ['accounting-payments'] });
      
    } catch (e) {
      toast.error("Failed to process ad-hoc payment.");
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
            Just Pay a Vendor
          </DialogTitle>
          <DialogDescription>
            Send funds to a vendor immediately without needing an approved invoice in the system.
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
                <SelectItem value="stripe">Stripe Connect (ACH/Wire)</SelectItem>
                <SelectItem value="paypal">PayPal Payouts (Wallet)</SelectItem>
                <SelectItem value="check">Mailed Check (Lob API)</SelectItem>
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
            {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : 'Send Payment Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
