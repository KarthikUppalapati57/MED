import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Building2, DollarSign, Users, Briefcase, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function FranchisorConsole() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();

  const { data: agreements = [], isLoading: loadingAgreements } = useQuery({
    queryKey: ['franchise_agreements', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('franchise_agreements')
        .select(`
          *,
          child_org:organizations!franchise_agreements_child_org_id_fkey(name)
        `)
        .eq('parent_org_id', organization?.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['royalty_invoices', organization?.id],
    queryFn: async () => {
      if (agreements.length === 0) return [];
      const agreementIds = agreements.map(a => a.id);
      const { data, error } = await supabase
        .from('royalty_invoices')
        .select('*')
        .in('agreement_id', agreementIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: agreements.length > 0
  });

  const simulateRoyaltyRun = async () => {
    const toastId = toast.loading('Running weekly royalty calculations...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculate-royalties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
        }
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const result = await res.json();
      
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['royalty_invoices'] });
      
      toast.success(`Success! Generated ${result.invoices_created} new royalty invoices.`, { id: toastId });
    } catch (e) {
      toast.error(`Run failed: ${e.message}`, { id: toastId });
    }
  };

  const formatCurrency = (val) => `$${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + Number(i.total_due), 0);

  if (!organization) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Franchisor Console</h1>
          <p className="text-muted-foreground mt-1">Manage franchise agreements and collect royalties automatically</p>
        </div>
        <Button onClick={simulateRoyaltyRun}>
          <TrendingUp className="h-4 w-4 mr-2" />
          Run Weekly Royalties
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Briefcase className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Active Franchises</p>
              <h3 className="text-2xl font-black">{agreements.length}</h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Outstanding Receivables</p>
              <h3 className="text-2xl font-black text-emerald-700">{formatCurrency(totalOutstanding)}</h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Total YTD Collected</p>
              <h3 className="text-2xl font-black">{formatCurrency(invoices.filter(i => i.status === 'paid').reduce((s,i)=>s+Number(i.total_due),0))}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Franchise Network</CardTitle>
          <CardDescription>Agreements and fee structures</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAgreements ? (
            <p className="text-muted-foreground text-sm">Loading agreements...</p>
          ) : agreements.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No franchise agreements configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Franchisee Organization</TableHead>
                  <TableHead>Royalty %</TableHead>
                  <TableHead>Marketing Fee %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agreements.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold">{a.child_org?.name}</TableCell>
                    <TableCell>{a.royalty_percentage}%</TableCell>
                    <TableCell>{a.marketing_fee_percentage}%</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        {a.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Royalty Invoices</CardTitle>
          <CardDescription>Generated fee collection events</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <p className="text-muted-foreground text-sm">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No invoices generated yet. Click "Run Weekly Royalties" to test the engine.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Gross Sales</TableHead>
                  <TableHead>Royalty</TableHead>
                  <TableHead>Marketing</TableHead>
                  <TableHead>Total Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell>{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.period_start} to {inv.period_end}
                    </TableCell>
                    <TableCell>{formatCurrency(inv.gross_sales)}</TableCell>
                    <TableCell>{formatCurrency(inv.royalty_fee)}</TableCell>
                    <TableCell>{formatCurrency(inv.marketing_fee)}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(inv.total_due)}</TableCell>
                    <TableCell>
                      {inv.status === 'paid' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">PAID</Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                          <Clock className="w-3 h-3 mr-1" /> PENDING
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
