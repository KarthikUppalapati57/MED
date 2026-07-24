import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Banknote, CheckCircle2, ClipboardCheck, FileCheck2, Loader2, Mail, PhoneCall, ShieldCheck, XCircle } from 'lucide-react';

const statusText = (value) => (value ? value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'Not Started');

const statusVariant = (value) => {
  if (['verified', 'on_file', 'confirmed', 'approved', 'active', 'connected'].includes(value)) return 'default';
  if (['failed', 'mismatch', 'rejected', 'expired'].includes(value)) return 'destructive';
  return 'secondary';
};

function StatusBadge({ value }) {
  return <Badge variant={statusVariant(value)}>{statusText(value)}</Badge>;
}

function StepCard({ icon: Icon, title, description, status, children }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {status && <StatusBadge value={status} />}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function VendorOnboardingPanel({ vendorId }) {
  const queryClient = useQueryClient();
  const [taxNotes, setTaxNotes] = React.useState('');
  const [taxFailureReason, setTaxFailureReason] = React.useState('');
  const [callbackNotes, setCallbackNotes] = React.useState({});
  const [overrideReasons, setOverrideReasons] = React.useState({});
  const [preferenceDraft, setPreferenceDraft] = React.useState(null);
  const [bankIntent, setBankIntent] = React.useState('add');
  const [taxEntryDraft, setTaxEntryDraft] = React.useState({ tax_id: '', legal_name: '', tax_classification: '' });
  const [bankEntryDraft, setBankEntryDraft] = React.useState({ account: '', routing: '' });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vendor_onboarding_panel', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['vendor_documents', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['vendor_onboarding_events', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
  }, [queryClient, vendorId]);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor_onboarding_panel', vendorId],
    queryFn: async () => {
      const [vendor, tax, docs, banking, callbacks, preferences] = await Promise.all([
        api.entities.Vendor.get(vendorId),
        supabase
          .from('vendor_tax_information')
          .select('id, legal_name, tax_classification, tax_id_last4, tax_id_type, w9_status, verification_status, verification_method, verification_checked_at, verification_failure_reason, w9_document_id, created_at')
          .eq('vendor_id', vendorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('vendor_documents')
          .select('id, document_type, file_name, storage_path, status, uploaded_via, reviewed_at, review_notes, created_at, expires_at')
          .eq('vendor_id', vendorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('vendor_banking_details')
          .select('id, account_last4, verification_state, callback_status, is_default, is_active, created_at, verified_at')
          .eq('vendor_id', vendorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('vendor_banking_change_requests')
          .select('id, banking_detail_id, request_reason, callback_phone_source, callback_status, confirmed_at, override_reason, override_at, notes, created_at')
          .eq('vendor_id', vendorId)
          .order('created_at', { ascending: false }),
        supabase
          .from('vendor_onboarding_preferences')
          .select('id, invoice_intake_method, edi_status, price_alert_threshold_percent, order_cadence, set_at')
          .eq('vendor_id', vendorId)
          .maybeSingle(),
      ]);

      for (const result of [tax, docs, banking, callbacks, preferences]) {
        if (result.error) throw result.error;
      }

      return {
        vendor,
        taxRows: tax.data || [],
        documents: docs.data || [],
        bankingRows: banking.data || [],
        callbackRequests: callbacks.data || [],
        preferences: preferences.data || null,
      };
    },
    enabled: !!vendorId,
  });

  React.useEffect(() => {
    if (data?.preferences && !preferenceDraft) {
      setPreferenceDraft({
        invoice_intake_method: data.preferences.invoice_intake_method || 'email',
        edi_status: data.preferences.edi_status || 'not_applicable',
        price_alert_threshold_percent: data.preferences.price_alert_threshold_percent ?? '',
        order_cadence: data.preferences.order_cadence || '',
      });
    }
    if (!data?.preferences && !preferenceDraft) {
      setPreferenceDraft({
        invoice_intake_method: 'email',
        edi_status: 'not_applicable',
        price_alert_threshold_percent: '',
        order_cadence: '',
      });
    }
  }, [data?.preferences, preferenceDraft]);

  const latestTax = data?.taxRows?.[0];
  const w9OnFile = data?.documents?.some((doc) => doc.document_type === 'w9' && doc.status === 'on_file');
  const taxVerified = latestTax?.verification_status === 'verified';
  const payableBank = data?.bankingRows?.find((row) => row.is_default && row.is_active && row.verification_state === 'verified' && row.callback_status === 'confirmed');
  const pendingCallback = data?.callbackRequests?.find((request) => !['confirmed', 'skipped_override', 'failed'].includes(request.callback_status));
  const canIssueBanking = taxVerified && w9OnFile;
  const canApprove = taxVerified && w9OnFile && !!payableBank;

  const reviewTaxMutation = useMutation({
    mutationFn: ({ status }) => supabase.rpc('review_vendor_tax_information', {
      p_tax_row_id: latestTax.id,
      p_verification_status: status,
      p_verification_method: 'manual_review',
      p_failure_reason: status === 'verified' ? null : taxFailureReason || 'Manual review failed',
      p_review_notes: taxNotes || null,
    }),
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Tax review saved');
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Tax review failed'),
  });

  const updateDocumentMutation = useMutation({
    mutationFn: ({ documentId, status }) => supabase
      .from('vendor_documents')
      .update({ status, reviewed_at: new Date().toISOString(), review_notes: taxNotes || null })
      .eq('id', documentId),
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Document review saved');
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Document update failed'),
  });

  const issueLinkMutation = useMutation({
    mutationFn: ({ type }) => supabase.functions.invoke('vendor-onboarding', {
      body: { action: 'send-magic-link', payload: { vendor_id: vendorId, type, intent: bankIntent } },
    }),
    onSuccess: ({ data: response, error }) => {
      if (error) throw error;
      if (response?.error) throw new Error(response.error);
      toast.success('Magic link generated');
      if (response?.magicLinkUrl) navigator.clipboard?.writeText(response.magicLinkUrl).catch(() => {});
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Unable to issue magic link'),
  });

  // Manual counterparts to the magic-link flows above -- for vendors who read tax/banking
  // details over the phone or by email instead of using the self-service portal.
  const adminTaxEntryMutation = useMutation({
    mutationFn: () => supabase.rpc('admin_submit_vendor_tax_info', {
      p_vendor_id: vendorId,
      p_tax_id: taxEntryDraft.tax_id,
      p_legal_name: taxEntryDraft.legal_name || null,
      p_tax_classification: taxEntryDraft.tax_classification || null,
    }),
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Tax info saved');
      setTaxEntryDraft({ tax_id: '', legal_name: '', tax_classification: '' });
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Unable to save tax info'),
  });

  const adminBankEntryMutation = useMutation({
    mutationFn: () => supabase.rpc('admin_submit_vendor_banking_info', {
      p_vendor_id: vendorId,
      p_account: bankEntryDraft.account,
      p_routing: bankEntryDraft.routing,
      p_intent: bankIntent,
    }),
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Banking info saved -- still requires callback verification below');
      setBankEntryDraft({ account: '', routing: '' });
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Unable to save banking info'),
  });

  const confirmCallbackMutation = useMutation({
    mutationFn: (requestId) => supabase.rpc('confirm_vendor_banking_callback', {
      p_request_id: requestId,
      p_notes: callbackNotes[requestId] || null,
    }),
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Banking callback confirmed');
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Callback confirmation failed'),
  });

  const overrideCallbackMutation = useMutation({
    mutationFn: (requestId) => {
      const reason = overrideReasons[requestId];
      if (!reason?.trim()) throw new Error('Override reason is required');
      return supabase.rpc('override_vendor_banking_callback', {
        p_request_id: requestId,
        p_override_reason: reason,
      });
    },
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Banking callback override recorded');
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Callback override failed'),
  });

  const savePreferencesMutation = useMutation({
    mutationFn: () => supabase.from('vendor_onboarding_preferences').upsert({
      vendor_id: vendorId,
      invoice_intake_method: preferenceDraft.invoice_intake_method,
      edi_status: preferenceDraft.invoice_intake_method === 'edi' ? preferenceDraft.edi_status : 'not_applicable',
      price_alert_threshold_percent: preferenceDraft.price_alert_threshold_percent === '' ? null : Number(preferenceDraft.price_alert_threshold_percent),
      order_cadence: preferenceDraft.order_cadence || null,
      set_at: new Date().toISOString(),
    }, { onConflict: 'vendor_id' }),
    onSuccess: ({ error }) => {
      if (error) throw error;
      toast.success('Onboarding preferences saved');
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Preference save failed'),
  });

  const approvalMutation = useMutation({
    mutationFn: (status) => supabase.rpc('transition_vendor_approval', {
      p_vendor_id: vendorId,
      p_new_status: status,
    }),
    onSuccess: ({ error }, status) => {
      if (error) throw error;
      toast.success(status === 'approved' ? 'Vendor approved' : 'Approval status updated');
      invalidate();
    },
    onError: (err) => toast.error(err.message || 'Approval transition failed'),
  });

  if (isLoading || !data || !preferenceDraft) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <Alert>
        <ClipboardCheck className="h-4 w-4" />
        <AlertTitle>Vendor Onboarding Control Center</AlertTitle>
        <AlertDescription>
          Banking and approval are locked until business verification, W-9 review, and callback-confirmed banking are complete.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-2">
        <StepCard icon={Mail} title="OTP and Vendor Links" description="Issue secure vendor-facing links after email OTP verification." status={data.vendor.onboarding_status}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => issueLinkMutation.mutate({ type: 'tax' })} disabled={issueLinkMutation.isPending}>
                Send Tax/W-9 Link
              </Button>
              <Button variant="outline" onClick={() => issueLinkMutation.mutate({ type: 'documents' })} disabled={issueLinkMutation.isPending}>
                Send Document Link
              </Button>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm text-muted-foreground">Or enter tax info manually (vendor provided it by phone/email)</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input placeholder="Tax ID (EIN/SSN)" value={taxEntryDraft.tax_id} onChange={(e) => setTaxEntryDraft({ ...taxEntryDraft, tax_id: e.target.value })} />
                <Input placeholder="Legal name" value={taxEntryDraft.legal_name} onChange={(e) => setTaxEntryDraft({ ...taxEntryDraft, legal_name: e.target.value })} />
                <Input placeholder="Classification (llc, sole_prop...)" value={taxEntryDraft.tax_classification} onChange={(e) => setTaxEntryDraft({ ...taxEntryDraft, tax_classification: e.target.value })} />
              </div>
              <Button size="sm" onClick={() => adminTaxEntryMutation.mutate()} disabled={adminTaxEntryMutation.isPending || !taxEntryDraft.tax_id.trim()}>
                Save Tax Info
              </Button>
            </div>
          </div>
        </StepCard>

        <StepCard icon={ShieldCheck} title="Business and Tax Review" description="Review the latest tax submission and W-9 before banking unlocks." status={latestTax?.verification_status}>
          {latestTax ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground">Legal Name</p>
                  <p className="font-medium">{latestTax.legal_name || 'Not provided'}</p>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground">Tax ID</p>
                  <p className="font-medium">{latestTax.tax_id_type?.toUpperCase() || 'Tax'} ending {latestTax.tax_id_last4 || '----'}</p>
                </div>
              </div>
              <Textarea value={taxNotes} onChange={(e) => setTaxNotes(e.target.value)} placeholder="Review notes" />
              <Input value={taxFailureReason} onChange={(e) => setTaxFailureReason(e.target.value)} placeholder="Failure reason, if rejecting" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => reviewTaxMutation.mutate({ status: 'verified' })} disabled={reviewTaxMutation.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Verify Business
                </Button>
                <Button variant="destructive" onClick={() => reviewTaxMutation.mutate({ status: 'failed' })} disabled={reviewTaxMutation.isPending}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject Verification
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tax submission has been received yet.</p>
          )}
        </StepCard>

        <StepCard icon={FileCheck2} title="Document Review" description="Mark uploaded W-9 and compliance documents as on file or rejected." status={w9OnFile ? 'on_file' : 'pending_review'}>
          <div className="space-y-3">
            {data.documents.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>}
            {data.documents.slice(0, 5).map((doc) => (
              <div key={doc.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{doc.file_name || doc.storage_path.split('/').pop()}</p>
                  <p className="text-sm text-muted-foreground">{statusText(doc.document_type)} Â· {statusText(doc.uploaded_via)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={doc.status} />
                  <Button size="sm" variant="outline" onClick={() => updateDocumentMutation.mutate({ documentId: doc.id, status: 'on_file' })}>On File</Button>
                  <Button size="sm" variant="destructive" onClick={() => updateDocumentMutation.mutate({ documentId: doc.id, status: 'rejected' })}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </StepCard>

        <StepCard icon={Banknote} title="Banking Request" description="Send banking links only after business verification and W-9 review clear." status={payableBank ? 'confirmed' : pendingCallback?.callback_status || 'pending'}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-44 space-y-2">
                <Label>Intent</Label>
                <Select value={bankIntent} onValueChange={setBankIntent}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add Account</SelectItem>
                    <SelectItem value="replace">Replace Default</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => issueLinkMutation.mutate({ type: 'bank' })} disabled={!canIssueBanking || issueLinkMutation.isPending}>
                Send Banking Link
              </Button>
            </div>
            {!canIssueBanking && <p className="text-sm text-muted-foreground">Banking unlocks after tax verification and W-9 on file.</p>}

            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm text-muted-foreground">Or enter account details manually (still requires callback verification below)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Account number" value={bankEntryDraft.account} onChange={(e) => setBankEntryDraft({ ...bankEntryDraft, account: e.target.value })} />
                <Input placeholder="Routing number" value={bankEntryDraft.routing} onChange={(e) => setBankEntryDraft({ ...bankEntryDraft, routing: e.target.value })} />
              </div>
              <Button size="sm" onClick={() => adminBankEntryMutation.mutate()} disabled={!canIssueBanking || adminBankEntryMutation.isPending || !bankEntryDraft.account.trim() || !bankEntryDraft.routing.trim()}>
                Save Banking Info
              </Button>
            </div>
            {data.bankingRows.map((row) => (
              <div key={row.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">Account ending {row.account_last4 || '----'} {row.is_default ? '(default)' : ''}</span>
                  <div className="flex gap-2"><StatusBadge value={row.verification_state} /><StatusBadge value={row.callback_status} /></div>
                </div>
              </div>
            ))}
          </div>
        </StepCard>

        <StepCard icon={PhoneCall} title="Callback Verification" description="Confirm bank changes using the phone number already on file." status={pendingCallback?.callback_status || (payableBank ? 'confirmed' : 'not_started')}>
          <div className="space-y-3">
            {data.callbackRequests.length === 0 && <p className="text-sm text-muted-foreground">No banking callback requests are open.</p>}
            {data.callbackRequests.map((request) => (
              <div key={request.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{statusText(request.request_reason)}</p>
                    <p className="text-sm text-muted-foreground">Call source: {statusText(request.callback_phone_source)}</p>
                  </div>
                  <StatusBadge value={request.callback_status} />
                </div>
                {!['confirmed', 'skipped_override'].includes(request.callback_status) && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Textarea value={callbackNotes[request.id] || ''} onChange={(e) => setCallbackNotes({ ...callbackNotes, [request.id]: e.target.value })} placeholder="Callback notes" />
                    <Textarea value={overrideReasons[request.id] || ''} onChange={(e) => setOverrideReasons({ ...overrideReasons, [request.id]: e.target.value })} placeholder="Override reason" />
                    <Button onClick={() => confirmCallbackMutation.mutate(request.id)} disabled={confirmCallbackMutation.isPending}>Confirm Callback</Button>
                    <Button variant="destructive" onClick={() => overrideCallbackMutation.mutate(request.id)} disabled={overrideCallbackMutation.isPending}>Override</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </StepCard>

        <StepCard icon={ClipboardCheck} title="Operating Preferences" description="Set invoice intake, EDI status, alert thresholds, and order cadence." status={data.preferences ? 'method_selected' : 'pending'}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Invoice Intake</Label>
              <Select value={preferenceDraft.invoice_intake_method} onValueChange={(value) => setPreferenceDraft({ ...preferenceDraft, invoice_intake_method: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="edi">EDI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>EDI Status</Label>
              <Select value={preferenceDraft.edi_status} onValueChange={(value) => setPreferenceDraft({ ...preferenceDraft, edi_status: value })} disabled={preferenceDraft.invoice_intake_method !== 'edi'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_applicable">Not Applicable</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price Alert Threshold %</Label>
              <Input type="number" min="0" step="0.01" value={preferenceDraft.price_alert_threshold_percent} onChange={(e) => setPreferenceDraft({ ...preferenceDraft, price_alert_threshold_percent: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Order Cadence</Label>
              <Input value={preferenceDraft.order_cadence} onChange={(e) => setPreferenceDraft({ ...preferenceDraft, order_cadence: e.target.value })} placeholder="Weekly, biweekly, as needed" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={() => savePreferencesMutation.mutate()} disabled={savePreferencesMutation.isPending}>Save Preferences</Button>
            </div>
          </div>
        </StepCard>

        <StepCard icon={ClipboardCheck} title="Internal Approval" description="Move the vendor into approval or active status once all gates pass." status={data.vendor.approval_status}>
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border p-3"><p className="text-muted-foreground">Tax</p><StatusBadge value={taxVerified ? 'verified' : latestTax?.verification_status || 'not_started'} /></div>
              <div className="rounded-md border p-3"><p className="text-muted-foreground">W-9</p><StatusBadge value={w9OnFile ? 'on_file' : 'pending_review'} /></div>
              <div className="rounded-md border p-3"><p className="text-muted-foreground">Banking</p><StatusBadge value={payableBank ? 'confirmed' : 'pending'} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => approvalMutation.mutate('pending_approval')} disabled={approvalMutation.isPending || data.vendor.approval_status !== 'draft'}>Submit for Approval</Button>
              <Button onClick={() => approvalMutation.mutate('approved')} disabled={approvalMutation.isPending || !canApprove || data.vendor.approval_status === 'approved'}>Approve Vendor</Button>
              <Button variant="destructive" onClick={() => approvalMutation.mutate('rejected')} disabled={approvalMutation.isPending || data.vendor.approval_status !== 'pending_approval'}>Reject</Button>
            </div>
          </div>
        </StepCard>
      </div>
    </div>
  );
}