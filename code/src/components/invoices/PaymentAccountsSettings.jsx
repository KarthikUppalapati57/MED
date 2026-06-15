import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Landmark, CreditCard, Banknote, Building2, Loader2, Zap, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export default function PaymentAccountsSettings() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'checking',
    routing_number_last4: '',
    account_number_last4: ''
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['payment-accounts', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id
  });

  const { data: vendors = [], isLoading: loadingVendors } = useQuery({
    queryKey: ['vendors', organization?.id],
    queryFn: () => api.entities.Vendor.filter({ organization_id: organization?.id }),
    enabled: !!organization?.id
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      return api.entities.Vendor.update(id, updates);
    },
    onSuccess: () => {
      toast.success("Vendor AutoPay settings updated");
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (err) => toast.error(err.message)
  });

  const createAccountMutation = useMutation({
    mutationFn: async (account) => {
      const { data, error } = await supabase.from('payment_accounts').insert({
        organization_id: organization.id,
        name: account.name,
        account_type: account.account_type,
        routing_number_last4: account.routing_number_last4 || null,
        account_number_last4: account.account_number_last4 || null
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Payment account created");
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      setIsAdding(false);
      setNewAccount({ name: '', account_type: 'checking', routing_number_last4: '', account_number_last4: '' });
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('payment_accounts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account deactivated");
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
    },
    onError: (err) => toast.error(err.message)
  });

  const handleAdd = () => {
    if (!newAccount.name.trim()) return toast.error("Account name is required");
    createAccountMutation.mutate(newAccount);
  };

  const getAccountIcon = (account_type) => {
    switch(account_type) {
      case 'checking': return <Landmark className="w-5 h-5 text-blue-600" />;
      case 'credit': return <CreditCard className="w-5 h-5 text-indigo-600" />;
      case 'petty_cash': return <Banknote className="w-5 h-5 text-emerald-600" />;
      case 'ap_account': return <Building2 className="w-5 h-5 text-slate-600" />;
      default: return <Landmark className="w-5 h-5" />;
    }
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading payment accounts...</div>;

  return (
    <div className="space-y-6">
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-teal-600" />
          Payment Accounts
        </CardTitle>
        <CardDescription>
          Configure the bank accounts, credit cards, or petty cash accounts used to pay invoices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(account => (
            <div key={account.id} className={`flex items-start justify-between p-4 border rounded-lg ${!account.is_active ? 'opacity-50 bg-slate-100' : 'bg-white shadow-sm'}`}>
              <div className="flex gap-3">
                <div className="mt-0.5">{getAccountIcon(account.account_type)}</div>
                <div>
                  <h3 className="font-semibold text-slate-900">{account.name}</h3>
                  <p className="text-xs text-slate-500 capitalize">{account.account_type.replace('_', ' ')} Account</p>
                  {(account.routing_number_last4 || account.account_number_last4) && (
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      {account.routing_number_last4 && `RTN: ...${account.routing_number_last4} `}
                      {account.account_number_last4 && `ACC: ...${account.account_number_last4}`}
                    </p>
                  )}
                  {!account.is_active && <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded mt-1 inline-block">Inactive</span>}
                </div>
              </div>
              {account.is_active && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 shrink-0"
                  onClick={() => deleteAccountMutation.mutate(account.id)}
                  disabled={deleteAccountMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {accounts.length === 0 && !isAdding && (
            <div className="col-span-full text-center p-6 border border-dashed rounded-lg text-slate-500 text-sm">
              No payment accounts configured.
            </div>
          )}
        </div>

        {isAdding ? (
          <div className="p-4 border rounded-lg bg-teal-50/50 space-y-4">
            <h4 className="text-sm font-semibold text-teal-900">Add New Account</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Account Name</Label>
                <Input 
                  value={newAccount.name} 
                  onChange={e => setNewAccount({...newAccount, name: e.target.value})}
                  placeholder="e.g. Chase Operating Checking"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Account Type</Label>
                <Select value={newAccount.account_type} onValueChange={v => setNewAccount({...newAccount, account_type: v})}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking Account</SelectItem>
                    <SelectItem value="credit">Credit Card</SelectItem>
                    <SelectItem value="petty_cash">Petty Cash</SelectItem>
                    <SelectItem value="ap_account">Accounts Payable (Manual)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(newAccount.account_type === 'checking' || newAccount.account_type === 'credit') && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Routing Number (Last 4) Optional</Label>
                    <Input 
                      value={newAccount.routing_number_last4} 
                      onChange={e => setNewAccount({...newAccount, routing_number_last4: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                      placeholder="1234"
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Account Number (Last 4) Optional</Label>
                    <Input 
                      value={newAccount.account_number_last4} 
                      onChange={e => setNewAccount({...newAccount, account_number_last4: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                      placeholder="5678"
                      maxLength={4}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button 
                size="sm" 
                className="bg-teal-600 hover:bg-teal-700" 
                onClick={handleAdd}
                disabled={createAccountMutation.isPending}
              >
                {createAccountMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Save Account"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Payment Account
          </Button>
        )}

      </CardContent>
    </Card>

    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-600" />
          AutoPay Rules
        </CardTitle>
        <CardDescription>
          Automatically process payouts the moment an invoice from these vendors reaches "Approved" status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingVendors ? (
          <div className="p-8 text-center animate-pulse">Loading vendors...</div>
        ) : (
          <div className="space-y-4">
            {vendors.map(vendor => (
              <div key={vendor.id} className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm">
                <div>
                  <h3 className="font-semibold text-slate-900">{vendor.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {vendor.autopay_enabled ? (
                      <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-none">AutoPay Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500">AutoPay Disabled</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="space-y-1 text-right">
                    <Label className="text-xs text-muted-foreground">Default Method</Label>
                    <Select 
                      value={vendor.default_payment_method || 'stripe'} 
                      onValueChange={(v) => updateVendorMutation.mutate({ id: vendor.id, updates: { default_payment_method: v }})}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stripe">Stripe (ACH)</SelectItem>
                        <SelectItem value="paypal">PayPal</SelectItem>
                        <SelectItem value="check">Mailed Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Label className="text-xs text-muted-foreground">Enable</Label>
                    <Switch 
                      checked={!!vendor.autopay_enabled}
                      onCheckedChange={(checked) => updateVendorMutation.mutate({ id: vendor.id, updates: { autopay_enabled: checked }})}
                    />
                  </div>
                </div>
              </div>
            ))}
            {vendors.length === 0 && (
              <div className="text-center p-6 border border-dashed rounded-lg text-slate-500 text-sm">
                No vendors found.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
