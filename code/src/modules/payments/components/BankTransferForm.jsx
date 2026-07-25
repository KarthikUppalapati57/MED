import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Loader2, Info } from 'lucide-react';

export default function BankTransferForm({ amount, invoiceNumber, onSuccess }) {
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reference.trim()) return;
    setProcessing(true);

    onSuccess({
      payment_method: 'bank_transfer',
      status: 'completed',
      transaction_id: reference.trim(),
      payment_date: new Date().toISOString().split('T')[0],
      bank_reference: reference.trim(),
      notes,
    });

    setProcessing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Record an ACH or bank transfer that was already initiated outside RestOps. Real vendor ACH payouts should use Release Funds with Stripe Connect and a selected operating payment account.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
        <div>
          <p className="text-muted-foreground">Invoice #</p>
          <p className="font-medium">{invoiceNumber || '-'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Amount</p>
          <p className="font-semibold">${amount?.toLocaleString()}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>ACH / Bank Transfer Reference #</Label>
          <Input
            placeholder="ACH or bank transfer confirmation number"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={processing || !reference.trim()}>
          {processing ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</>
          ) : (
            <><Building2 className="h-4 w-4 mr-2" /> Record ACH Payment</>
          )}
        </Button>
      </form>
    </div>
  );
}

