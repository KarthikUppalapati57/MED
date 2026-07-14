import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Save } from 'lucide-react';
import { AP_ROUTING_OPTIONS, normalizeApRouting } from '@/lib/apRouting';

const EXPENSE_CATEGORIES = ['food', 'beverage', 'supplies', 'equipment', 'packaging', 'cleaning', 'other'];

export default function AccountingControls({ vendorId }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor_accounting', vendorId],
    queryFn: () => api.entities.Vendor.get(vendorId),
    enabled: !!vendorId
  });

  const { data: paymentAccounts = [] } = useQuery({
    queryKey: ['payment_accounts'],
    queryFn: () => api.entities.PaymentAccount.filter({ organization_id: organization?.id }),
    enabled: !!organization?.id
  });

  const { data: orgDefaults } = useQuery({
    queryKey: ['organization_vendor_defaults', organization?.id],
    queryFn: async () => {
      const rows = await api.entities.VendorDefaultSettings.list();
      return rows?.[0] || null;
    },
    enabled: !!organization?.id
  });

  const [formData, setFormData] = useState(null);

  React.useEffect(() => {
    if (vendor && !formData) {
      setFormData({
        default_expense_category: vendor.default_expense_category || 'food',
        default_payment_account_id: vendor.default_payment_account_id || 'none',
        file_routing_preference: vendor.file_routing_preference || 'storage',
        ap_routing_preference: normalizeApRouting(vendor.ap_routing_preference),
        use_org_accounting_defaults: vendor.use_org_accounting_defaults !== false,
        exclude_from_accounting: !!vendor.exclude_from_accounting,
        restrict_categories: !!(vendor.allowed_expense_categories && vendor.allowed_expense_categories.length > 0),
        allowed_expense_categories: vendor.allowed_expense_categories || [],
      });
    }
  }, [vendor, formData]);

  const updateMutation = useMutation({
    mutationFn: (updates) => api.entities.Vendor.update(vendorId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_accounting', vendorId]);
      queryClient.invalidateQueries(['vendor', vendorId]);
      toast.success('Accounting controls updated');
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`)
  });

  const handleSave = () => {
    if (!formData) return;
    updateMutation.mutate({
      default_expense_category: formData.default_expense_category,
      default_payment_account_id: formData.default_payment_account_id === 'none' ? null : formData.default_payment_account_id,
      file_routing_preference: formData.file_routing_preference,
      ap_routing_preference: normalizeApRouting(formData.ap_routing_preference),
      use_org_accounting_defaults: formData.use_org_accounting_defaults,
      exclude_from_accounting: formData.exclude_from_accounting,
      allowed_expense_categories: formData.restrict_categories ? formData.allowed_expense_categories : null,
    });
  };

  const toggleCategory = (category) => {
    setFormData(prev => ({
      ...prev,
      allowed_expense_categories: prev.allowed_expense_categories.includes(category)
        ? prev.allowed_expense_categories.filter(c => c !== category)
        : [...prev.allowed_expense_categories, category],
    }));
  };

  if (isLoading || !formData) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <Card className="max-w-2xl bg-card border-border/40 shadow-sm">
      <CardHeader>
        <CardTitle>Accounting Controls</CardTitle>
        <CardDescription>Configure default routing and payment settings for this vendor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <Label>Use accounting system settings</Label>
            <p className="text-xs text-muted-foreground">Inherit the default payment account and terms from Vendor Default Settings instead of setting them per-vendor.</p>
          </div>
          <Switch
            checked={formData.use_org_accounting_defaults}
            onCheckedChange={v => setFormData({ ...formData, use_org_accounting_defaults: v })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <Label>Exclude from Accounting</Label>
            <p className="text-xs text-muted-foreground">Invoices from this vendor should not go to the accounting system.</p>
          </div>
          <Switch
            checked={formData.exclude_from_accounting}
            onCheckedChange={v => setFormData({ ...formData, exclude_from_accounting: v })}
          />
        </div>

        {formData.exclude_from_accounting && (
          <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">
            Invoices from this vendor won't be sent to the accounting system.
          </p>
        )}

        {formData.use_org_accounting_defaults && orgDefaults && (
          <div className="rounded-lg border border-border/40 p-4 text-sm space-y-1 bg-secondary/10">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Inherited from accounting system settings</p>
            <p>Payment Account: <span className="font-medium">{paymentAccounts.find(a => a.id === orgDefaults.default_payment_account_id)?.name || 'Not set'}</span></p>
            <p>Payment Terms: <span className="font-medium uppercase">{orgDefaults.default_payment_terms?.replace('_', ' ') || 'Not set'}</span></p>
          </div>
        )}

        <fieldset disabled={formData.exclude_from_accounting} className="grid grid-cols-2 gap-6 disabled:opacity-50">
          <div className="space-y-2">
            <Label>Default Expense Category</Label>
            <Select
              value={formData.default_expense_category}
              onValueChange={v => setFormData({...formData, default_expense_category: v})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="food">Food</SelectItem>
                <SelectItem value="beverage">Beverage</SelectItem>
                <SelectItem value="supplies">Supplies</SelectItem>
                <SelectItem value="equipment">Equipment</SelectItem>
                <SelectItem value="packaging">Packaging</SelectItem>
                <SelectItem value="cleaning">Cleaning</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used for auto-coding invoices from this vendor.</p>
          </div>

          <div className="space-y-2">
            <Label>Default Payment Account</Label>
            <Select
              value={formData.default_payment_account_id}
              onValueChange={v => setFormData({...formData, default_payment_account_id: v})}
              disabled={formData.use_org_accounting_defaults}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Ask every time)</SelectItem>
                {paymentAccounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name} (...{acc.last4})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Payment Terms</Label>
            <Select
              value={formData.payment_terms}
              onValueChange={v => setFormData({...formData, payment_terms: v})}
              disabled={formData.use_org_accounting_defaults}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                <SelectItem value="net_15">Net 15</SelectItem>
                <SelectItem value="net_30">Net 30</SelectItem>
                <SelectItem value="net_45">Net 45</SelectItem>
                <SelectItem value="net_60">Net 60</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>AP Invoice Routing</Label>
            <Select 
              value={formData.ap_routing_preference} 
              onValueChange={v => setFormData({
                ...formData,
                ap_routing_preference: v,
                file_routing_preference: ['payments', 'storage', 'accounting'].includes(v) ? v : formData.file_routing_preference,
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select routing" />
              </SelectTrigger>
              <SelectContent>
                {AP_ROUTING_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Controls whether approved invoices enter Bill Pay, accounting export, storage, or paid-history only.</p>
          </div>
        </fieldset>

        <div className="rounded-lg border border-border/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Category Restrictions</Label>
              <p className="text-xs text-muted-foreground">Limit the categories that can be used for this vendor.</p>
            </div>
            <Switch
              checked={formData.restrict_categories}
              onCheckedChange={v => setFormData({ ...formData, restrict_categories: v })}
            />
          </div>
          {formData.restrict_categories && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
              {EXPENSE_CATEGORIES.map(category => (
                <label key={category} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                  <Checkbox
                    checked={formData.allowed_expense_categories.includes(category)}
                    onCheckedChange={() => toggleCategory(category)}
                  />
                  {category}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border/40 flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-primary">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Controls
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

