import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Banknote, CheckCircle2, Landmark, Link2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const purposeLabels = {
  platform_billing: 'Client pays platform',
  vendor_funding: 'Client funds vendor payments',
  vendor_receiving: 'Vendor receives payments',
  backup: 'Backup account',
  location_specific: 'Location-specific account',
};

const addablePurposeLabels = Object.fromEntries(Object.entries(purposeLabels).filter(([value]) => value !== 'vendor_receiving'));

const defaultBankForm = {
  purpose: 'vendor_funding',
  nickname: '',
  bank_name: '',
  account_holder_name: '',
  account_type: 'checking',
  routing_number: '',
  account_number: '',
  default_for_owner: true,
};

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

async function invokePaymentBankAccounts(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('payment-bank-accounts', {
    body: { action, payload },
  });
  if (error) throw error;
  if (data?.error) {
    const detail = Array.isArray(data.missing) ? `: ${data.missing.join(', ')}` : '';
    throw new Error(`${data.error}${detail}`);
  }
  return data;
}

export default function ProviderNeutralPaymentSetup() {
  const { userProfile, organization, brand, location } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const [data, setData] = useState({
    bank_accounts: [],
    provider_config: null,
    fee_policies: [],
    fee_counters: [],
    installed_adapters: [],
  });
  const [bankForm, setBankForm] = useState(() => ({
    ...defaultBankForm,
    account_holder_name: userProfile?.full_name || organization?.name || '',
  }));
  const [providerConfig, setProviderConfig] = useState({
    collection_provider: 'stripe_ach_debit',
    payout_provider: 'stripe_connect_custom',
    check_provider: 'checkbook',
    enabled: true,
  });
  const [feePolicy, setFeePolicy] = useState({
    fee_paid_by: 'client',
    collection_fee_mode: 'pass_through',
    payout_fee_mode: 'pass_through',
    disclosure_text: 'Convenience fees are displayed before payment and included in the total deducted when the client chooses to pay the fee.',
  });
  const [feePreview, setFeePreview] = useState({
    amount: '120.00',
    flow: 'client_to_vendor',
    fee_paid_by: 'client',
    estimate: null,
  });

  const scope = useMemo(() => ({
    tenant_id: userProfile?.tenant_id || null,
    organization_id: organization?.id || userProfile?.organization_id || null,
    brand_id: brand?.brand_id || brand?.id || userProfile?.brand_id || null,
    location_id: location?.id || userProfile?.location_id || null,
  }), [userProfile, organization, brand, location]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await invokePaymentBankAccounts('list', scope);
      setData(result);
      setProviderConfig({
        collection_provider: result.provider_config?.collection_provider || 'stripe_ach_debit',
        payout_provider: result.provider_config?.payout_provider || 'stripe_connect_custom',
        check_provider: result.provider_config?.check_provider || 'checkbook',
        enabled: result.provider_config?.enabled !== false,
      });
      const activePolicy = result.fee_policies?.[0];
      if (activePolicy) {
        setFeePolicy({
          fee_paid_by: activePolicy.fee_paid_by || 'client',
          collection_fee_mode: activePolicy.collection_fee_mode || 'pass_through',
          payout_fee_mode: activePolicy.payout_fee_mode || 'pass_through',
          disclosure_text: activePolicy.disclosure_text || '',
        });
      }
    } catch (err) {
      toast.error(err.message || 'Could not load payment setup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [scope.organization_id, scope.brand_id, scope.location_id]);

  const createBankAccount = async (event) => {
    event.preventDefault();
    if (!scope.organization_id) {
      toast.error('Choose an organization before adding a bank account.');
      return;
    }
    setSaving(true);
    try {
      await invokePaymentBankAccounts('create_bank_account', {
        ...scope,
        ...bankForm,
        owner_type: 'organization',
        owner_id: scope.organization_id,
        source: 'payment_setup',
      });
      toast.success('Bank account stored in the provider-neutral vault.');
      setBankForm({ ...defaultBankForm, account_holder_name: userProfile?.full_name || organization?.name || '' });
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save bank account.');
    } finally {
      setSaving(false);
    }
  };

  const saveProviderConfig = async () => {
    setSaving(true);
    try {
      await invokePaymentBankAccounts('save_provider_config', { ...scope, ...providerConfig });
      toast.success('Provider routing saved.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save provider routing.');
    } finally {
      setSaving(false);
    }
  };

  const saveFeePolicy = async () => {
    setSaving(true);
    try {
      await invokePaymentBankAccounts('save_fee_policy', { ...scope, ...feePolicy });
      toast.success('Fee policy saved.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save fee policy.');
    } finally {
      setSaving(false);
    }
  };

  const estimateFee = async () => {
    try {
      const result = await invokePaymentBankAccounts('estimate_fee', feePreview);
      setFeePreview((prev) => ({ ...prev, estimate: result.estimate }));
    } catch (err) {
      toast.error(err.message || 'Could not estimate fee.');
    }
  };

  const setDefault = async (bankAccountId) => {
    try {
      await invokePaymentBankAccounts('set_default', { bank_account_id: bankAccountId });
      toast.success('Default account updated.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not update default account.');
    }
  };

  const disable = async (bankAccountId) => {
    try {
      await invokePaymentBankAccounts('disable', { bank_account_id: bankAccountId });
      toast.success('Bank account disabled.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not disable bank account.');
    }
  };

  const linkProvider = async (bankAccount) => {
    const providerUse = bankAccount.purpose === 'vendor_receiving' ? 'payout' : 'collection';
    setLinkingId(bankAccount.id);
    try {
      const result = await invokePaymentBankAccounts('link_provider', {
        bank_account_id: bankAccount.id,
        provider_use: providerUse,
      });
      if (result.provider_link?.provider_status === 'configuration_missing') {
        toast.warning('Provider adapter is ready, but API keys are not configured yet.');
      } else {
        toast.success('Provider link synced.');
      }
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not link provider.');
    } finally {
      setLinkingId(null);
    }
  };

  const updateBank = (field, value) => setBankForm((prev) => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading provider-neutral payment setup...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Provider-Neutral ACH Foundation
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-sm font-semibold">Bank vault</p>
            <p className="mt-1 text-xs text-muted-foreground">Raw bank details are stored by backend-only vault functions. UI reads only metadata and last 4 digits.</p>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-sm font-semibold">Provider adapters</p>
            <p className="mt-1 text-xs text-muted-foreground">Installed: {data.installed_adapters.join(', ') || 'none'}</p>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-sm font-semibold">Current scope</p>
            <p className="mt-1 text-xs text-muted-foreground">{organization?.name || 'Organization'}{location?.name ? ` / ${location.name}` : ''}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4" /> Bank Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.bank_accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No provider-neutral bank accounts yet.</div>
            ) : (
              data.bank_accounts.map((account) => (
                <div key={account.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{account.nickname || account.bank_name || 'Bank account'} ****{account.account_last4}</p>
                        {account.default_for_owner && <Badge variant="outline">Default</Badge>}
                        <Badge>{purposeLabels[account.purpose] || account.purpose}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{account.account_type} account, routing ****{account.routing_last4}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(account.bank_account_provider_links || []).map((link) => (
                          <Badge key={link.id} variant="outline" className="gap-1">
                            <Link2 className="h-3 w-3" /> {link.provider} / {link.provider_use}: {link.provider_status}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!account.default_for_owner && (
                        <Button size="sm" variant="outline" onClick={() => setDefault(account.id)}>Set default</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => linkProvider(account)} disabled={linkingId === account.id}>
                        {linkingId === account.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                        Link provider
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => disable(account.id)}>Disable</Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4" /> Add Bank Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createBankAccount} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Purpose</Label>
                <Select value={bankForm.purpose} onValueChange={(value) => updateBank('purpose', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(addablePurposeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="Nickname" value={bankForm.nickname} onChange={(e) => updateBank('nickname', e.target.value)} />
              <Input placeholder="Bank name" value={bankForm.bank_name} onChange={(e) => updateBank('bank_name', e.target.value)} />
              <Input placeholder="Account holder name" value={bankForm.account_holder_name} onChange={(e) => updateBank('account_holder_name', e.target.value)} required />
              <Select value={bankForm.account_type} onValueChange={(value) => updateBank('account_type', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Routing number" inputMode="numeric" value={bankForm.routing_number} onChange={(e) => updateBank('routing_number', e.target.value)} required />
              <Input placeholder="Account number" inputMode="numeric" value={bankForm.account_number} onChange={(e) => updateBank('account_number', e.target.value)} required />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={bankForm.default_for_owner} onChange={(e) => updateBank('default_for_owner', e.target.checked)} />
                Make default for this purpose
              </label>
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
                Save to Platform Vault
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" /> Provider Routing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800">
              <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
              Stripe adapters are installed but live calls require API keys. Until then, linking records will show configuration_missing.
            </div>
            <div className="space-y-1.5">
              <Label>Collection provider</Label>
              <Select value={providerConfig.collection_provider} onValueChange={(value) => setProviderConfig((prev) => ({ ...prev, collection_provider: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe_ach_debit">Stripe ACH Direct Debit</SelectItem>
                  <SelectItem value="not_configured">Not configured</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payout provider</Label>
              <Select value={providerConfig.payout_provider} onValueChange={(value) => setProviderConfig((prev) => ({ ...prev, payout_provider: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe_connect_custom">Stripe Connect Custom</SelectItem>
                  <SelectItem value="not_configured">Not configured</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Routing enabled</p>
                <p className="text-xs text-muted-foreground">When disabled, provider routing fails closed.</p>
              </div>
              <Switch checked={providerConfig.enabled} onCheckedChange={(value) => setProviderConfig((prev) => ({ ...prev, enabled: value }))} />
            </div>
            <Button onClick={saveProviderConfig} disabled={saving} className="w-full">Save Provider Routing</Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" /> Fee Policy & Counter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Client-to-vendor fee payer</Label>
              <Select value={feePolicy.fee_paid_by} onValueChange={(value) => setFeePolicy((prev) => ({ ...prev, fee_paid_by: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client pays convenience fee</SelectItem>
                  <SelectItem value="platform">Platform absorbs convenience fee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input value={feePolicy.disclosure_text} onChange={(e) => setFeePolicy((prev) => ({ ...prev, disclosure_text: e.target.value }))} placeholder="Fee disclosure text" />
            <Button onClick={saveFeePolicy} disabled={saving} className="w-full">Save Fee Policy</Button>

            <div className="rounded-lg border p-3">
              <div className="grid grid-cols-3 gap-2">
                <Input value={feePreview.amount} onChange={(e) => setFeePreview((prev) => ({ ...prev, amount: e.target.value }))} />
                <Select value={feePreview.flow} onValueChange={(value) => setFeePreview((prev) => ({ ...prev, flow: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_to_platform">Client to platform</SelectItem>
                    <SelectItem value="client_to_vendor">Client to vendor</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={estimateFee}>Estimate</Button>
              </div>
              {feePreview.estimate && (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold">{money(feePreview.estimate.base_amount_cents)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fee</p><p className="font-semibold">{money(feePreview.estimate.total_fee_cents)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total deducted</p><p className="font-semibold">{money(feePreview.estimate.total_debit_cents)}</p></div>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              {(data.fee_counters || []).slice(0, 3).map((counter) => (
                <div key={`${counter.provider}-${counter.month}`} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{counter.provider} / {counter.month}</p>
                  <p className="text-xs text-muted-foreground">Client charged: ${counter.total_fees_charged_to_clients} · Platform paid: ${counter.total_fees_paid_by_platform} · Net recovery: ${counter.net_fee_recovery}</p>
                </div>
              ))}
              {(!data.fee_counters || data.fee_counters.length === 0) && <p className="text-xs text-muted-foreground">No fee events yet. Counters will populate after payment processing records fee events.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

