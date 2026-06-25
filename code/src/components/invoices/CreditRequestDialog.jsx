import React, { useState } from 'react';
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
import { useAuth } from '@/lib/AuthContext';

export default function CreditRequestDialog({ invoice, open, onOpenChange }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [photo, setPhoto] = useState(null);

  const requestCreditMutation = useMutation({
    mutationFn: async () => {
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error("Enter a valid credit amount");
      }
      if (!reason.trim()) {
        throw new Error("Provide a reason for the credit");
      }

      return api.financial.requestInvoiceCredit({
        invoiceId: invoice.id,
        amount: parseFloat(amount),
        reason: reason.trim(),
        photoUrl: photo ? "s3://mock-bucket/credit-photo.jpg" : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success("Digital Credit Requested! Invoice automatically short-paid.");
      onOpenChange(false);
      // Reset form
      setAmount('');
      setReason('');
      setPhoto(null);
      setIsCameraMode(false);
    },
    onError: (error) => toast.error(error.message || "Failed to process credit request")
  });

  const simulateCameraCapture = () => {
    setIsCameraMode(true);
    setTimeout(() => {
      setPhoto('captured'); // Mock successful capture
      setIsCameraMode(false);
      toast.success("Photo captured!");
    }, 1500);
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

        {isCameraMode ? (
          <div className="flex flex-col items-center justify-center p-8 space-y-6 text-center bg-black/5 rounded-xl h-[300px] border-2 border-dashed">
            <Camera className="h-16 w-16 text-muted-foreground animate-pulse mb-4" />
            <p className="font-medium">Camera activated...</p>
            <p className="text-sm text-muted-foreground">Point at the damaged item and hold still.</p>
          </div>
        ) : (
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
              {!photo ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={simulateCameraCapture}>
                    <Camera className="h-4 w-4 mr-2" /> Take Photo
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Upload className="h-4 w-4 mr-2" /> Upload File
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center">
                      <Camera className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">evidence_001.jpg</p>
                      <p className="text-xs text-muted-foreground">Ready to attach</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPhoto(null)} className="text-resend-red">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            className="bg-resend-orange hover:bg-resend-orange/90 text-white px-8"
            onClick={() => requestCreditMutation.mutate()}
            disabled={requestCreditMutation.isPending || isCameraMode}
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

