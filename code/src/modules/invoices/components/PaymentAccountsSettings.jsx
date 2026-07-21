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
import { Plus, Trash2, Landmark, CreditCard, Banknote, Building2, Loader2, Zap } from 'lucide-react';
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
    account_number_last4: '',
    full_routing_number: '',
    full_account_number: ''
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['payment-accounts', organization?.id],
    queryFn: () => api.entities.PaymentAccount.filter(
      { organization_id: organization.id },
      { orderBy: 'created_at' }
    ),
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
      const created = await api.financial.createPaymentAccount({
        organization_id: organization.id,
        name: account.name,
        account_type: account.account_type,
        routing_number_last4: account.routing_number_last4 || null,
        account_number_last4: account.account_number_last4 || null
      });

      if (account.full_routing_number && account.full_account_number) {
        const { error: dwollaError } = await supabase.functions.invoke('create-dwolla-funding-source', {
          body: {
            target_type: 'organization',
            payment_account_id: created.id,
            routing_number: account.full_routing_number,
            account_number: account.full_account_number,
            bank_account_type: 'checking',
          }
        });
        if (dwollaError) throw new Error(`Account created, but ACH setup failed: ${dwollaError.message}`);
      }

      return created;
    },
    onSuccess: () => {
      toast.success("Payment account created");
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      setIsAdding(false);
      setNewAccount({ name: '', account_type: 'checking', routing_number_last4: '', account_number_last4: '', full_routing_number: '', full_account_number: '' });
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id) => api.financial.deactivatePaymentAccount(id),
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
      case 'checking': return <Landmark className="w-5 h-5 text-primary" />;
      case 'credit': return <CreditCard className="w-5 h-5 text-primary" />;
      case 'petty_cash': return <Banknote className="w-5 h-5 text-emerald-500" />;
      case 'ap_account': return <Building2 className="w-5 h-5 text-muted-foreground" />;
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
          Add, replace, or deactivate the operating accounts used for vendor bill-pay. Full ACH details are sent to Dwolla setup and only masked digits are kept here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(account => (
            <div key={account.id} className={`flex items-start justify-between p-4 border rounded-lg ${!account.is_active ? 'opacity-50 bg-secondary/50' : 'bg-card shadow-sm'}`}>
              <div className="flex gap-3">
                <div className="mt-0.5">{getAccountIcon(account.account_type)}</div>
                <div>
                  <h3 className="font-semibold text-foreground">{account.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{account.account_type.replace('_', ' ')} Account</p>
                  {((account.metadata?.routing_number_last4 || account.routing_number_last4) || (account.last_four || account.account_number_last4)) && (
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      {account.routing_number_last4 && `RTN: ...${account.routing_number_last4} `}
                      {account.account_number_last4 && `ACC: ...${account.account_number_last4}`}
                    </p>
                  )}
                  {!account.is_active && <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded mt-1 inline-block">Inactive</span>}
                </div>
              </div>
              {account.is_active && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-500 hover:text-red-700 hover:bg-destructive/10 h-8 w-8 p-0 shrink-0"
                  onClick={() => deleteAccountMutation.mutate(account.id)}
                  disabled={deleteAccountMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {accounts.length === 0 && !isAdding && (
            <div className="col-span-full text-center p-6 border border-dashed rounded-lg text-muted-foreground text-sm">
              No payment accounts configured.
            </div>
          )}
        </div>

        {isAdding ? (
          <div className="p-4 border rounded-lg bg-secondary/40 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Add New Account</h4>
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
                  <SelectTrigger className="bg-background">
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
              {newAccount.account_type === 'checking' && (
                <>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Enable real Dwolla ACH payouts from this account (optional)</Label>
                    <p className="text-xs text-muted-foreground">Provide the full routing/account number to create a real Dwolla funding source. Numbers are sent directly to a secure vault, never stored in plain text.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Full Routing Number</Label>
                    <Input
                      value={newAccount.full_routing_number}
                      onChange={e => setNewAccount({...newAccount, full_routing_number: e.target.value.replace(/\D/g, '').slice(0, 9)})}
                      placeholder="9 digits"
                      maxLength={9}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Full Account Number</Label>
                    <Input
                      value={newAccount.full_account_number}
                      onChange={e => setNewAccount({...newAccount, full_account_number: e.target.value.replace(/\D/g, '').slice(0, 17)})}
                      placeholder="Account number"
                      maxLength={17}
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
          <Zap className="w-5 h-5 text-primary" />
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
              <div key={vendor.id} className="flex items-center justify-between p-4 border rounded-lg bg-card shadow-sm">
                <div>
                  <h3 className="font-semibold text-foreground">{vendor.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {vendor.autopay_enabled ? (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none">AutoPay Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">AutoPay Disabled</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="space-y-1 text-right">
                    <Label className="text-xs text-muted-foreground">Default Method</Label>
                    <Select 
                      value={vendor.default_payment_method || 'checkbook_physical'}
                      onValueChange={(v) => updateVendorMutation.mutate({ id: vendor.id, updates: { default_payment_method: v }})}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dwolla_ach">Dwolla (ACH)</SelectItem>
                        <SelectItem value="checkbook_digital">Digital Check (Checkbook.io)</SelectItem>
                        <SelectItem value="checkbook_physical">Mailed Check (Checkbook.io)</SelectItem>
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
              <div className="text-center p-6 border border-dashed rounded-lg text-muted-foreground text-sm">
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


