import React from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";

export default function Billing() {
  const { organization } = useAuth();

  const { data: plan = null } = useAuthQuery({
    queryKey: ['billing-custom-plan', organization?.plan_id],
    queryFn: async () => {
      if (!organization?.plan_id) return null;
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, description, features, is_active')
        .eq('id', organization.plan_id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!organization?.plan_id,
  });

  const { data: locations = [] } = useAuthQuery({
    queryKey: ['billing-locations', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('locations')
        .select('id, plan_id, subscription_status')
        .eq('organization_id', organization.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const billingLocationCount = Math.max(1, locations.length || 0);
  const planName = plan?.name || 'Custom plan';

  return (
    <div className="p-6 space-y-8 min-h-screen bg-secondary/30">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Plan</h1>
          <p className="text-muted-foreground mt-1">Your RestOps subscription is managed as a client-specific commercial plan.</p>
        </div>
      </div>

      <Card className="border-none shadow-md bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="text-lg text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            Current Status
            <Badge className="bg-resend-green text-white">{organization?.subscription_status || 'Custom'}</Badge>
          </CardTitle>
          <CardDescription className="text-indigo-700/80 dark:text-indigo-300/80">
            {planName} is assigned across {billingLocationCount} location{billingLocationCount === 1 ? '' : 's'}.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black text-foreground">Custom commercial plan</CardTitle>
          <CardDescription>
            Fixed self-service upgrades are disabled. Plan scope, modules, billing, implementation, and support are discussed with each client before changes are applied.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assigned plan</p>
              <p className="mt-2 text-lg font-black text-foreground">{planName}</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Billable locations</p>
              <p className="mt-2 text-lg font-black text-foreground">{billingLocationCount}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Contact your RestOps account team to review pricing, add locations, enable modules, or update payment terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}