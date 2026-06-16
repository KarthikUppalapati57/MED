import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, Building2, Send, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function PlatformInvoices() {
  const { user, role: userRole } = useAuth();
  const authChecked = !!user;
  const [generating, setGenerating] = useState(new Set());

  const { data: plans = [], isLoading: isLoadingPlans } = useAuthQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('id, name, price_monthly');
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: orgs = [], isLoading: isLoadingOrgs } = useAuthQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('id, name, plan_id, admin_email:primary_contact_email').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const handleGenerateInvoice = async (org) => {
    const plan = plans.find(p => p.id === org.plan_id);
    if (!plan) {
      toast.error("Organization has no plan assigned.");
      return;
    }

    setGenerating(prev => { const n = new Set(prev); n.add(org.id); return n; });
    const toastId = toast.loading(`Generating Stripe invoice for ${org.name}...`);

    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-invoice', {
        body: {
          org_id: org.id,
          description: `Platform Billing Invoice for ${plan.name} Tier`
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(
        <div className="flex flex-col gap-2">
           <span className="font-bold">Invoice created and sent!</span>
           <a href={data.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-xs underline hover:text-brand transition-colors">
             View Hosted Invoice <ExternalLink className="w-3 h-3 ml-1" />
           </a>
        </div>, 
        { id: toastId, duration: 8000 }
      );
    } catch (err) {
      console.error("Failed to generate invoice:", err);
      toast.error(err.message || "Failed to generate invoice", { id: toastId });
    } finally {
      setGenerating(prev => { const n = new Set(prev); n.delete(org.id); return n; });
    }
  };

  if (!authChecked || userRole !== 'platform_admin') {
    return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-8 min-h-screen bg-secondary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Platform Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">Generate and send SaaS billing invoices via Stripe</p>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
           <CardTitle className="text-base flex items-center gap-2">
             <Building2 className="w-5 h-5 text-muted-foreground" />
             Client Billing Assessment
           </CardTitle>
           <p className="text-xs text-muted-foreground">Issue one-off or automated manual invoices for active tenants.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-[11px] font-bold">ORGANIZATION</TableHead>
                <TableHead className="text-[11px] font-bold">CONTACT EMAIL</TableHead>
                <TableHead className="text-[11px] font-bold">ASSIGNED PLAN</TableHead>
                <TableHead className="text-[11px] font-bold">MONTHLY RATE</TableHead>
                <TableHead className="text-[11px] font-bold text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingOrgs || isLoadingPlans ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : orgs.map(org => {
                const plan = plans.find(p => p.id === org.plan_id);
                return (
                  <TableRow key={org.id} className="hover:bg-secondary/20 transition-colors">
                    <TableCell>
                      <p className="font-bold text-sm text-foreground">{org.name}</p>
                      <p className="text-[10px] text-muted-foreground">ID: {org.id.split('-')[0]}</p>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-muted-foreground">
                      {org.admin_email || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-card text-xs font-semibold">
                        {plan?.name || <span className="text-muted-foreground italic font-normal">No Plan</span>}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-black text-foreground">
                      {plan ? `$${plan.price_monthly.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                       <Button 
                        size="sm" 
                        onClick={() => handleGenerateInvoice(org)}
                        disabled={!plan || generating.has(org.id)}
                        className="bg-brand text-primary-foreground hover:bg-brand/90 font-bold h-8 px-4 text-xs rounded-lg shadow-sm"
                       >
                         {generating.has(org.id) ? (
                           <Loader2 className="w-3.5 h-3.5 animate-spin" />
                         ) : (
                           <>
                             <Send className="w-3.5 h-3.5 mr-1.5" />
                             Issue Invoice
                           </>
                         )}
                       </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
