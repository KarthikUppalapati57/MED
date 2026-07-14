import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save } from 'lucide-react';

const MISC_CHARGE_TYPES = [
  { key: 'taxes_pst', label: 'Taxes / PST' },
  { key: 'delivery_freight', label: 'Delivery / Shipping / Freight / Fuel' },
  { key: 'other', label: 'Other' },
  { key: 'credit', label: 'Credit' },
];

const EXPENSE_CATEGORIES = ['food', 'beverage', 'supplies', 'equipment', 'packaging', 'cleaning', 'other'];

const DEFAULT_RULES = MISC_CHARGE_TYPES.reduce((acc, { key }) => {
  acc[key] = { method: 'proportionate', category: null, locked: false };
  return acc;
}, {});

export default function VendorDefaultSettingsTab() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();

  const { data: paymentAccounts = [] } = useQuery({
    queryKey: ['payment_accounts'],
    queryFn: () => api.entities.PaymentAccount.filter({ organization_id: organization?.id }),
    enabled: !!organization?.id,
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['organization_vendor_defaults', organization?.id],
    queryFn: async () => {
      const rows = await api.entities.VendorDefaultSettings.list();
      return rows?.[0] || null;
    },
    enabled: !!organization?.id,
  });

  const [formData, setFormData] = useState(null);

  React.useEffect(() => {
    if (!formData && organization?.id && existing !== undefined) {
      setFormData({
        misc_charge_rules: existing?.misc_charge_rules || DEFAULT_RULES,
        default_handwritten_credit_process: existing?.default_handwritten_credit_process || 'combined',
        default_payment_account_id: existing?.default_payment_account_id || 'none',
        default_payment_terms: existing?.default_payment_terms || 'net_30',
      });
    }
  }, [existing, formData, organization?.id]);

  const saveMutation = useMutation({
    mutationFn: (payload) => existing
      ? api.entities.VendorDefaultSettings.update(existing.id, payload)
      : api.entities.VendorDefaultSettings.create({ ...payload, organization_id: organization?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['organization_vendor_defaults', organization?.id]);
      toast.success('Default settings updated');
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  const updateRule = (key, patch) => {
    setFormData(prev => ({
      ...prev,
      misc_charge_rules: {
        ...prev.misc_charge_rules,
        [key]: { ...prev.misc_charge_rules[key], ...patch },
      },
    }));
  };

  const handleSave = () => {
    if (!formData) return;
    saveMutation.mutate({
      misc_charge_rules: formData.misc_charge_rules,
      default_handwritten_credit_process: formData.default_handwritten_credit_process,
      default_payment_account_id: formData.default_payment_account_id === 'none' ? null : formData.default_payment_account_id,
      default_payment_terms: formData.default_payment_terms,
    });
  };

  if (isLoading || !formData) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <Card className="max-w-3xl bg-card border-border/40 shadow-sm">
      <CardHeader>
        <CardTitle>Default Settings</CardTitle>
        <CardDescription>Company-wide defaults applied to vendors that use accounting system settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Miscellaneous Charges</Label>
          {MISC_CHARGE_TYPES.map(({ key, label }) => {
            const rule = formData.misc_charge_rules[key] || DEFAULT_RULES[key];
            return (
              <div key={key} className="rounded-lg border border-border/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Locked</Label>
                    <Switch checked={rule.locked} onCheckedChange={(v) => updateRule(key, { locked: v })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select value={rule.method} onValueChange={(v) => updateRule(key, { method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proportionate">Book Proportionately</SelectItem>
                      <SelectItem value="single_category">Book to One Category</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={rule.category || 'none'}
                    onValueChange={(v) => updateRule(key, { category: v === 'none' ? null : v })}
                    disabled={rule.method !== 'single_category'}
                  >
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border/40">
          <div className="space-y-2">
            <Label>Handwritten Vendor Credit Process</Label>
            <Select
              value={formData.default_handwritten_credit_process}
              onValueChange={(v) => setFormData({ ...formData, default_handwritten_credit_process: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">Combined</SelectItem>
                <SelectItem value="separate">Separate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default Payment Account</Label>
            <Select
              value={formData.default_payment_account_id}
              onValueChange={(v) => setFormData({ ...formData, default_payment_account_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {paymentAccounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name} (...{acc.last4})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default Payment Terms</Label>
            <Select
              value={formData.default_payment_terms}
              onValueChange={(v) => setFormData({ ...formData, default_payment_terms: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                <SelectItem value="net_15">Net 15</SelectItem>
                <SelectItem value="net_30">Net 30</SelectItem>
                <SelectItem value="net_45">Net 45</SelectItem>
                <SelectItem value="net_60">Net 60</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-4 border-t border-border/40 flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-primary">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
