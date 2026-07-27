import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
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
import { useConfirmation } from '@/hooks/useConfirmation';
import { runInvoiceValidationChecks, summarizeValidationIssues, VALIDATION_CHECK_LABELS } from '../lib/invoiceValidation';

const CHECKING_RESULTS = Object.fromEntries(
  Object.keys(VALIDATION_CHECK_LABELS).map(key => [key, { status: 'checking', message: '' }])
);

const ValidationCheck = ({ label, result }) => {
  const status = result?.status || 'checking';
  const icons = {
    pass: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    fail: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    checking: <Loader2 className="h-5 w-5 text-muted-foreground/70 animate-spin" />,
  };

  const statusText = {
    pass: 'Passed',
    fail: 'Failed',
    warning: 'Warning',
    checking: 'Checking...',
  };

  const statusColors = {
    pass: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/12 dark:border-emerald-500/35',
    fail: 'bg-red-50 border-red-200 dark:bg-red-500/12 dark:border-red-500/35',
    warning: 'bg-amber-50 border-amber-200 dark:bg-amber-500/12 dark:border-amber-500/35',
    checking: 'bg-muted/40 border-border',
  };

  return (
    <div className={cn(
      "flex items-center justify-between gap-4 p-4 rounded-lg border",
      statusColors[status]
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {icons[status] || icons.checking}
        <div className="min-w-0">
          <span className="font-medium text-foreground block">{label}</span>
          {result?.message && (
            <span className="text-xs text-muted-foreground block mt-0.5">{result.message}</span>
          )}
        </div>
      </div>
      <span className={cn(
        "text-sm font-medium whitespace-nowrap",
        status === 'pass' && 'text-emerald-700 dark:text-emerald-300',
        status === 'fail' && 'text-red-700 dark:text-red-300',
        status === 'warning' && 'text-amber-700 dark:text-amber-300',
        status === 'checking' && 'text-muted-foreground'
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
  onCancel,
  onValidated,
}) {
  const [step, setStep] = useState('validating');
  const [validating, setValidating] = useState(true);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [results, setResults] = useState(CHECKING_RESULTS);
  const { confirm } = useConfirmation();

  const lastValidatedRef = useRef(null);

  useEffect(() => {
    if (open && invoice) {
      // Prevent running multiple times for the same invoice while open
      if (lastValidatedRef.current === invoice) return;
      lastValidatedRef.current = invoice;

      let isMounted = true;

      const doValidation = async () => {
        setStep('validating');
        setApprovalNotes('');
        setValidating(true);
        setResults(CHECKING_RESULTS);

        try {
          const checkResults = await runInvoiceValidationChecks(invoice);
          if (!isMounted) return;
          setResults(checkResults);
          onValidated?.();
        } catch (err) {
          console.error("[Validation] Global failure:", err);
        } finally {
          if (isMounted) {
            setValidating(false);
          }
        }
      };

      doValidation();

      return () => {
        isMounted = false;
      };
    } else {
      lastValidatedRef.current = null;
    }
  }, [open, invoice]);

  const hasFailures = Object.values(results).some(r => r.status === 'fail');
  const hasWarnings = Object.values(results).some(r => r.status === 'warning');
  const allPassed = !hasFailures && !hasWarnings && !validating;
  const paidDetection = invoice?.validation_results?.paid_status_detection;

  const handleApprove = async () => {
    const ok = await confirm({
      title: hasWarnings ? 'Approve with warnings?' : 'Approve invoice?',
      description: hasWarnings
        ? 'This invoice has validation warnings. Approving will move it to pending approval for the next reviewer.'
        : 'This will move the invoice to pending approval for the next reviewer.',
      confirmText: 'Approve',
      cancelText: 'Cancel',
      variant: hasWarnings ? 'warning' : 'info',
    });
    if (!ok) return;
    onSave({
      ...invoice,
      validation_results: results,
      status: 'pending_approval',
      validation_notes: approvalNotes,
      // Date will be set by the policy engine when fully approved
    });
    onOpenChange(false);
  };

  const handleReject = async () => {
    const ok = await confirm({
      title: 'Reject invoice?',
      description: 'This will mark the invoice as rejected. This cannot be undone.',
      confirmText: 'Reject',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!ok) return;
    onSave({
      ...invoice,
      validation_results: results,
      status: 'rejected',
      validation_notes: approvalNotes,
    });
    onOpenChange(false);
  };

  const issues = summarizeValidationIssues(results);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-popover text-popover-foreground">
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
              {Object.entries(VALIDATION_CHECK_LABELS).map(([key, label]) => (
                <ValidationCheck key={key} label={label} result={results[key]} />
              ))}
              {paidDetection?.detected && (
                <ValidationCheck
                  label={paidDetection.should_mark_paid ? 'Paid Stamp Detected' : 'Possible Paid Stamp'}
                  result={{ status: paidDetection.should_mark_paid ? 'pass' : 'warning' }}
                />
              )}
            </div>

            {!validating && (
              <div className={cn(
                "p-4 rounded-lg text-sm border",
                allPassed ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-100" :
                hasFailures ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/35 dark:bg-red-500/12 dark:text-red-100" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
              )}>
                {allPassed ? "All validation checks passed successfully." :
                 hasFailures ? "Critical issues were found during validation." : "Validation completed with some warnings."}
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <div className="flex gap-2">
                {!validating && (
                  <Button variant="outline" onClick={() => setStep('approval')}>
                    Continue to Approval
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="bg-muted/40 rounded-xl p-4 border border-border space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vendor</span>
                <span className="font-medium text-foreground">{invoice?.vendor_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice Number</span>
                <span className="font-medium text-foreground">{invoice?.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-bold text-foreground">${invoice?.total_amount?.toLocaleString()}</span>
              </div>
              {paidDetection?.detected && (
                <div className={`rounded-lg border p-3 text-sm ${
                  paidDetection.should_mark_paid
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-100'
                    : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100'
                }`}>
                  {paidDetection.should_mark_paid
                    ? 'Paid stamp detected. This invoice will be treated as paid after approval.'
                    : 'Possible paid signal detected. Confirm Payment Status before approving.'}
                </div>
              )}
            </div>

            {issues.length > 0 && (
              <div className={cn(
                "rounded-lg border p-3 text-sm space-y-1",
                hasFailures ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/35 dark:bg-red-500/12 dark:text-red-100" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
              )}>
                <p className="font-medium">
                  {hasFailures ? 'This invoice is flagged — validation failed:' : 'Validation warnings:'}
                </p>
                {issues.map((line, i) => <p key={i}>{line}</p>)}
                {hasFailures && <p className="mt-1">Add a note below to approve anyway, or reject it.</p>}
              </div>
            )}

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
                className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/35 dark:text-red-300 dark:hover:bg-red-500/12"
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
