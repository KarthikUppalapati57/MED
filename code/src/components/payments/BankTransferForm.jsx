import React, { useState } from 'react';
import { BANK_DETAILS } from '@/lib/paymentService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Copy, Check, Loader2, Info } from 'lucide-react';

export default function BankTransferForm({ amount, vendorName, invoiceNumber, onSuccess }) {
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [senderBank, setSenderBank] = useState('');
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(null);

  const copyToClipboard = (text, field) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API may not be available
      console.warn('Clipboard API not available');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);

    // Simulate brief processing delay
    await new Promise(r => setTimeout(r, 800));

    onSuccess({
      payment_method: 'bank_transfer',
      status: 'pending',
      transaction_id: `BT-${Date.now()}`,
      payment_date: new Date().toISOString().split('T')[0],
      bank_reference: reference,
      sender_bank: senderBank,
      notes,
    });

    setProcessing(false);
  };

  const bankFields = [
    { label: 'Bank Name', value: BANK_DETAILS.bank_name, key: 'bank_name' },
    { label: 'Account Name', value: BANK_DETAILS.account_name, key: 'account_name' },
    { label: 'Account Number', value: BANK_DETAILS.account_number, key: 'account_number' },
    { label: 'Routing Number', value: BANK_DETAILS.routing_number, key: 'routing_number' },
    { label: 'SWIFT Code', value: BANK_DETAILS.swift_code, key: 'swift_code' },
  ];

  return (
    <div className="space-y-4">
      {/* Receiving Bank Details */}
      <div className="bg-blue-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-800 mb-3">
          <Building2 className="h-4 w-4" />
          Transfer to this Account
        </div>

        {bankFields.map((field) => (
          <div key={field.key} className="flex items-center justify-between text-sm">
            <span className="text-blue-600">{field.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-blue-900">{field.value}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(field.value, field.key)}
                className="text-blue-400 hover:text-blue-600 transition-colors"
              >
                {copied === field.key ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}

        <div className="border-t border-blue-200 pt-2 mt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-600">Amount</span>
            <span className="font-bold text-lg text-blue-900">${amount?.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-blue-600">Reference</span>
            <span className="font-medium text-blue-900">{invoiceNumber}</span>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Please initiate the bank transfer using the details above, then fill in the confirmation below. 
          The payment will be marked as <strong>pending</strong> until an admin confirms receipt.
        </span>
      </div>

      {/* Confirmation Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Your Bank Name</Label>
          <Input
            placeholder="e.g., Chase, Wells Fargo"
            value={senderBank}
            onChange={(e) => setSenderBank(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Transfer Reference / Confirmation #</Label>
          <Input
            placeholder="Bank transfer reference number"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-teal-600 hover:bg-teal-700"
          disabled={processing}
        >
          {processing ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</>
          ) : (
            <><Building2 className="h-4 w-4 mr-2" /> Confirm Transfer Initiated</>
          )}
        </Button>
      </form>
    </div>
  );
}
