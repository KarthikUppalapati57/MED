import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save } from 'lucide-react';
import { AP_ROUTING_OPTIONS, normalizeApRouting } from '@/lib/apRouting';

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

  const [formData, setFormData] = useState(null);

  React.useEffect(() => {
    if (vendor && !formData) {
      setFormData({
        default_expense_category: vendor.default_expense_category || 'food',
        default_payment_account_id: vendor.default_payment_account_id || 'none',
        file_routing_preference: vendor.file_routing_preference || 'storage',
        ap_routing_preference: normalizeApRouting(vendor.ap_routing_preference)
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
      ap_routing_preference: normalizeApRouting(formData.ap_routing_preference)
    });
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
        <div className="grid grid-cols-2 gap-6">
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

