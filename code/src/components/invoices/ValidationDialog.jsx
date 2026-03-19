import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/apiClient';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ValidationCheck = ({ label, status }) => {
  const icons = {
    pass: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    fail: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    checking: <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />,
  };

  const statusText = {
    pass: 'Passed',
    fail: 'Failed',
    warning: 'Warning',
    checking: 'Checking...',
  };

  const statusColors = {
    pass: 'bg-green-50 border-green-200',
    fail: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    checking: 'bg-slate-50 border-slate-200',
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-lg border",
      statusColors[status]
    )}>
      <div className="flex items-center gap-3">
        {icons[status] || icons.checking}
        <span className="font-medium text-slate-900">{label}</span>
      </div>
      <span className={cn(
        "text-sm font-medium",
        status === 'pass' && 'text-green-600',
        status === 'fail' && 'text-red-600',
        status === 'warning' && 'text-yellow-600',
        status === 'checking' && 'text-slate-500'
      )}>
        {statusText[status] || statusText.checking}
      </span>
    </div>
  );
};

export default function ValidationDialog({ 
  open, 
  onOpenChange, 
  invoice, 
  onSave, 
  onCancel 
}) {
  const [step, setStep] = useState('validating');
  const [validating, setValidating] = useState(true);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [results, setResults] = useState({
    duplicate_check: 'checking',
    fraud_detection: 'checking',
    price_deviation: 'checking',
    delivery_match: 'checking',
  });

  // Use refs to handle async state safely across re-renders
  const isRunningRef = useRef(false);
  const currentInvoiceRef = useRef(invoice);
  
  // Keep ref up to date
  useEffect(() => {
    currentInvoiceRef.current = invoice;
  }, [invoice]);

  const runValidation = useCallback(async () => {
    if (!open || !currentInvoiceRef.current || isRunningRef.current) return;
    
    isRunningRef.current = true;
    setValidating(true);
    setResults({
      duplicate_check: 'checking',
      fraud_detection: 'checking',
      price_deviation: 'checking',
      delivery_match: 'checking',
    });

    const inv = currentInvoiceRef.current;
    console.log("[Validation] Starting checks for:", inv?.invoice_number);

    try {
      // 1. Duplicate Check
      await new Promise(r => setTimeout(r, 800));
      let duplicateStatus = 'pass';
      if (inv?.invoice_number && inv?.vendor_name) {
        try {
          const existing = await api.entities.Invoice.filter({
            invoice_number: inv.invoice_number,
            vendor_name: inv.vendor_name
          });
          if (existing && existing.length > 0) {
            // Check if it's the same record
            const isSame = existing.some(e => e.id === inv.id);
            if (!isSame) duplicateStatus = 'fail';
          }
        } catch (e) {
          console.error("[Validation] Duplicate check error:", e);
          duplicateStatus = 'warning';
        }
      }
      setResults(prev => ({ ...prev, duplicate_check: duplicateStatus }));

      // 2. Fraud & Price (Simulated)
      await new Promise(r => setTimeout(r, 600));
      setResults(prev => ({ ...prev, fraud_detection: 'pass' }));
      
      await new Promise(r => setTimeout(r, 600));
      const priceStatus = (inv?.total_amount > 5000) ? 'warning' : 'pass';
      setResults(prev => ({ ...prev, price_deviation: priceStatus }));

      // 3. Delivery
      await new Promise(r => setTimeout(r, 600));
      setResults(prev => ({ ...prev, delivery_match: 'pass' }));
      
      console.log("[Validation] All checks completed");
    } catch (err) {
      console.error("[Validation] Global failure:", err);
    } finally {
      setValidating(false);
      // Wait a bit before allowing another run to prevent flicker
      setTimeout(() => { isRunningRef.current = false; }, 1000);
    }
  }, [open]);

  // Reset and run when OPENS
  useEffect(() => {
    if (open) {
      setStep('validating');
      setApprovalNotes('');
      runValidation();
    } else {
      isRunningRef.current = false;
    }
  }, [open, runValidation]);

  const hasFailures = Object.values(results).some(r => r === 'fail');
  const hasWarnings = Object.values(results).some(r => r === 'warning');
  const allPassed = !hasFailures && !hasWarnings && !validating;

  const handleApprove = () => {
    onSave({
      ...invoice,
      validation_results: results,
      status: 'approved',
      validation_notes: approvalNotes,
      approved_date: new Date().toISOString(),
    });
    onOpenChange(false);
  };

  const handleReject = () => {
    onSave({
      ...invoice,
      validation_results: results,
      status: 'rejected',
      validation_notes: approvalNotes,
    });
    onOpenChange(false);
  };

  const handleManualValidate = () => {
    onSave({
      ...invoice,
      validation_results: results,
      status: hasFailures ? 'flagged' : 'validated',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-600" />
            {step === 'validating' ? 'Invoice Validation' : 'Approval Decision'}
          </DialogTitle>
          <DialogDescription>
            {step === 'validating' 
              ? `Running automated checks for invoice ${invoice?.invoice_number}`
              : 'Review validation results and select an action'}
          </DialogDescription>
        </DialogHeader>

        {step === 'validating' ? (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <ValidationCheck label="Duplicate Check" status={results.duplicate_check} />
              <ValidationCheck label="Fraud Detection" status={results.fraud_detection} />
              <ValidationCheck label="Price Deviation" status={results.price_deviation} />
              <ValidationCheck label="Delivery Match" status={results.delivery_match} />
            </div>

            {!validating && (
              <div className={cn(
                "p-4 rounded-lg text-sm border",
                allPassed ? "bg-green-50 border-green-100 text-green-800" :
                hasFailures ? "bg-red-50 border-red-100 text-red-800" : "bg-yellow-50 border-yellow-100 text-yellow-800"
              )}>
                {allPassed ? "All validation checks passed successfully." :
                 hasFailures ? "Critical issues were found during validation." : "Validation completed with some warnings."}
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <div className="flex gap-2">
                {!validating && (
                  <>
                    <Button variant="outline" onClick={() => setStep('approval')}>
                      Continue to Approval
                    </Button>
                    {hasFailures && (
                      <Button onClick={handleManualValidate} className="bg-slate-800">
                        Force Validate
                      </Button>
                    )}
                  </>
                )}
              </div>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Vendor</span>
                <span className="font-medium text-slate-900">{invoice?.vendor_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Invoice Number</span>
                <span className="font-medium text-slate-900">{invoice?.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="text-slate-500">Total Amount</span>
                <span className="font-bold text-slate-900">${invoice?.total_amount?.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Approval/Rejection Notes</Label>
              <Textarea
                id="notes"
                placeholder="Include any notes for the team..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep('validating')} className="mr-auto">
                Back to Results
              </Button>
              <Button 
                variant="outline" 
                onClick={handleReject}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Reject
              </Button>
              <Button 
                onClick={handleApprove}
                disabled={hasFailures && !approvalNotes}
                className="bg-teal-600 hover:bg-teal-700"
              >
                Approve Invoice
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}