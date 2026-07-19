import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Upload, AlertCircle, X, DollarSign, Send, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export default function CreditRequestDialog({ invoice, open, onOpenChange }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const requestCreditMutation = useMutation({
    mutationFn: async () => {
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error("Enter a valid credit amount");
      }
      if (!reason.trim()) {
        throw new Error("Provide a reason for the credit");
      }

      let photoUrl = null;
      if (photoFile) {
        const path = `${invoice.organization_id || organization?.id || 'unassigned'}/credit-requests/${invoice.id}/${Date.now()}_${photoFile.name}`;
        const { error: uploadError } = await supabase.storage.from('invoices').upload(path, photoFile);
        if (uploadError) throw uploadError;
        photoUrl = path;
      }

      return api.financial.requestInvoiceCredit({
        invoiceId: invoice.id,
        amount: parseFloat(amount),
        reason: reason.trim(),
        photoUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success("Digital Credit Requested! Invoice automatically short-paid.");
      onOpenChange(false);
      // Reset form
      setAmount('');
      setReason('');
      clearPhoto();
    },
    onError: (error) => toast.error(error.message || "Failed to process credit request")
  });

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2 text-resend-orange">
            <AlertCircle className="h-6 w-6" />
            Digital Credit Request
          </DialogTitle>
          <DialogDescription>
            Request a vendor credit for damaged or missing items on invoice {invoice?.invoice_number || 'Unknown'}. We will automatically adjust the AP ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Credit Amount Requested</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                className="pl-9 text-lg font-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason (Required)</Label>
            <Textarea
              placeholder="e.g., Driver dropped a case of milk, 2 gallons burst."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Photo Evidence (Optional)</Label>
            {!photoFile ? (
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  id="credit-photo-camera"
                />
                <Button variant="outline" className="flex-1" asChild>
                  <label htmlFor="credit-photo-camera" className="cursor-pointer">
                    <Camera className="h-4 w-4 mr-2" /> Take Photo
                  </label>
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  id="credit-photo-upload"
                />
                <Button variant="outline" className="flex-1" asChild>
                  <label htmlFor="credit-photo-upload" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" /> Upload File
                  </label>
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                <div className="flex items-center gap-2">
                  <img src={photoPreviewUrl} alt="Evidence preview" className="w-10 h-10 rounded object-cover" />
                  <div>
                    <p className="text-sm font-medium truncate max-w-[180px]">{photoFile.name}</p>
                    <p className="text-xs text-muted-foreground">Ready to attach</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearPhoto} className="text-resend-red">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-resend-orange hover:bg-resend-orange/90 text-white px-8"
            onClick={() => requestCreditMutation.mutate()}
            disabled={requestCreditMutation.isPending}
          >
            {requestCreditMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Credit Claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

