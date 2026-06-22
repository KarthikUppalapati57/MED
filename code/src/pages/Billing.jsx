import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { MODULE_DEFINITIONS } from "@/lib/moduleConfig";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { loadStripe } from '@stripe/stripe-js';

// Mock stripe integration for MVP
const mockStripeCheckout = async (planId, orgId) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, url: `/billing?success=true&plan=${planId}` });
    }, 1500);
  });
};

export default function Billing() {
  const { user, organization } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const { data: plans = [], isLoading: isLoadingPlans } = useAuthQuery({
    queryKey: ['active_plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').eq('is_active', true).order('price_monthly', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const handleCheckout = async (plan) => {
    if (!organization?.id) return toast.error("Organization context missing");
    setIsProcessing(true);
    setSelectedPlan(plan.id);

    try {
      const response = await supabase.functions.invoke('create-checkout-session', { 
        body: { plan_id: plan.id, org_id: organization.id } 
      });
      
      if (response.error) throw response.error;
      
      const { url } = response.data;
      if (url) {
        // Redirect to Stripe checkout (or simulated success URL)
        window.location.href = url;
      }
    } catch (err) {
      toast.error("Checkout failed: " + err.message);
    } finally {
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  return (
    <div className="p-6 space-y-8 min-h-screen bg-secondary/30">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Plans</h1>
          <p className="text-muted-foreground mt-1">Manage your Restops SaaS subscription.</p>
        </div>
      </div>

      <Card className="border-none shadow-md bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="text-lg text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            Current Status
            <Badge className="bg-resend-green text-white">Active</Badge>
          </CardTitle>
          <CardDescription className="text-indigo-700/80 dark:text-indigo-300/80">
            You are currently on the {organization?.plan_id ? "Custom" : "Starter"} Plan.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoadingPlans ? (
          <div className="col-span-3 py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : plans.map(plan => {
          const isCurrentPlan = organization?.plan_id === plan.id;
          
          return (
            <Card key={plan.id} className={cn(
              "border-0 shadow-sm relative group overflow-hidden transition-all hover:shadow-md",
              isCurrentPlan ? "ring-2 ring-indigo-500 bg-indigo-50/30" : ""
            )}>
              {isCurrentPlan && (
                <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                  CURRENT PLAN
                </div>
              )}
              <CardHeader className="pb-2 relative z-10">
                <CardTitle className="text-xl font-black text-foreground">{plan.name}</CardTitle>
                <p className="text-4xl font-black text-foreground mt-2">${plan.price_monthly}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>
              </CardHeader>
              <CardContent className="relative z-10 flex flex-col h-full">
                <div className="space-y-3 mb-8 mt-4 flex-grow">
                  {(Array.isArray(plan.features) ? plan.features : []).map(f => (
                    <div key={f} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full bg-resend-green/10 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 text-resend-green" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{MODULE_DEFINITIONS[f]?.label || f}</span>
                    </div>
                  ))}
                </div>
                <Button 
                  className={cn(
                    "w-full rounded-xl mt-auto",
                    isCurrentPlan ? "bg-secondary text-foreground hover:bg-secondary" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  )}
                  onClick={() => handleCheckout(plan)}
                  disabled={isCurrentPlan || isProcessing}
                >
                  {isProcessing && selectedPlan === plan.id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : (
                    "Upgrade to " + plan.name
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  );
}
