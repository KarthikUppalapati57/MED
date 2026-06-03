import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Plus, CheckCircle2, Edit3, Building2, Loader2, DollarSign } from "lucide-react";
import { MODULE_DEFINITIONS, ALL_MODULE_KEYS } from "@/lib/moduleConfig";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PlatformPlans() {
  const { user, role: userRole } = useAuth();
  const authChecked = !!user;
  const queryClient = useQueryClient();

  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [planForm, setPlanForm] = useState({ 
    name: '', 
    description: '', 
    price_monthly: 0, 
    features: [], 
    is_active: true,
    stripe_price_id: ''
  });

  const { data: plans = [], isLoading: isLoadingPlans } = useAuthQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_monthly', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: orgs = [], isLoading: isLoadingOrgs } = useAuthQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const handleSavePlan = async () => {
    if (!planForm.name) { toast.error("Plan name is required"); return; }
    setIsSaving(true);
    const toastId = toast.loading(editingPlan ? "Updating plan..." : "Creating plan...");
    try {
      const payload = {
        name: planForm.name,
        description: planForm.description,
        price_monthly: parseFloat(planForm.price_monthly),
        features: planForm.features,
        is_active: planForm.is_active,
        stripe_price_id: planForm.stripe_price_id || null
      };

      if (editingPlan) {
        const { error } = await supabase.from('plans').update(payload).eq('id', editingPlan.id);
        if (error) throw error;
        toast.success("Plan updated successfully", { id: toastId });
      } else {
        const { error } = await supabase.from('plans').insert([payload]);
        if (error) throw error;
        toast.success("Plan created successfully", { id: toastId });
      }
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setShowPlanDialog(false);
      setEditingPlan(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to save plan", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const openEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      price_monthly: plan.price_monthly,
      features: plan.features || [],
      is_active: plan.is_active,
      stripe_price_id: plan.stripe_price_id || ''
    });
    setShowPlanDialog(true);
  };

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanForm({ name: '', description: '', price_monthly: 0, features: [], is_active: true, stripe_price_id: '' });
    setShowPlanDialog(true);
  };

  if (!authChecked || userRole !== 'platform_admin') {
    return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-8 min-h-screen bg-secondary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Platform Plans</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage global SaaS subscriptions and service tiers</p>
          </div>
        </div>
        <Button onClick={openNewPlan} className="bg-brand hover:bg-brand/90 text-black font-bold rounded-xl h-10 px-6">
          <Plus className="w-4 h-4 mr-2" />
          Create Plan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoadingPlans ? (
          <div className="col-span-3 py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : plans.map(plan => (
          <Card key={plan.id} className="border-0 shadow-sm relative group overflow-hidden transition-all hover:shadow-md">
            <CardHeader className="pb-2 relative z-10">
              <div className="flex justify-between items-start">
                 <Badge className={cn(
                   "text-[10px] font-bold mb-2 border-none",
                   plan.is_active ? "bg-resend-green/10 text-resend-green" : "bg-muted text-muted-foreground"
                 )}>
                   {plan.is_active ? 'Active' : 'Draft'}
                 </Badge>
                 <Button onClick={() => openEditPlan(plan)} variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-secondary/50 hover:bg-secondary">
                   <Edit3 className="w-4 h-4 text-muted-foreground" />
                 </Button>
              </div>
              <CardTitle className="text-xl font-black text-foreground">{plan.name}</CardTitle>
              <p className="text-4xl font-black text-foreground mt-2">${plan.price_monthly}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
            </CardHeader>
            <CardContent className="relative z-10">
               <p className="text-xs text-muted-foreground mb-6">{plan.description || 'No description provided'}</p>
               <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                 {(Array.isArray(plan.features) ? plan.features : []).map(f => (
                   <div key={f} className="flex items-center gap-2">
                     <div className="w-4 h-4 rounded-full bg-resend-green/10 flex items-center justify-center shrink-0"><CheckCircle2 className="w-2.5 h-2.5 text-resend-green" /></div>
                     <span className="text-[11px] font-medium text-muted-foreground">{MODULE_DEFINITIONS[f]?.label || f}</span>
                   </div>
                 ))}
               </div>
            </CardContent>
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-brand/5 rounded-full blur-3xl pointer-events-none" />
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
           <CardTitle className="text-base flex items-center gap-2">
             <Building2 className="w-5 h-5 text-muted-foreground" />
             Organization Plan Assignments
           </CardTitle>
           <p className="text-xs text-muted-foreground">Review which plan each organization is currently subscribed to.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="text-[11px] font-bold">ORGANIZATION</TableHead>
                <TableHead className="text-[11px] font-bold">CURRENT PLAN</TableHead>
                <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingOrgs ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : orgs.map(org => {
                const plan = plans.find(p => p.id === org.plan_id);
                return (
                  <TableRow key={org.id} className="hover:bg-secondary/20 transition-colors">
                    <TableCell className="font-bold text-sm">{org.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-card text-xs font-semibold">
                        {plan?.name || <span className="text-muted-foreground italic font-normal">None Assigned</span>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "text-[10px] font-bold border-none uppercase tracking-wider",
                        org.subscription_status === 'active' ? "bg-resend-green/10 text-resend-green" : 
                        org.subscription_status === 'trialing' ? "bg-resend-yellow/10 text-resend-yellow" : 
                        "bg-secondary text-muted-foreground"
                      )}>
                        {org.subscription_status || 'unprovisioned'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                       <Button variant="outline" size="sm" className="h-8 text-xs font-bold rounded-lg border-border hover:bg-secondary">
                         Change Plan
                       </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit/Create Plan Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-2xl rounded-3xl border-none shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
            <DialogDescription>Configure the SaaS subscription tier</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Plan Details</Label>
                <div className="space-y-3 bg-secondary/30 p-4 rounded-2xl border border-border">
                  <div>
                    <Label className="text-xs font-semibold">Name</Label>
                    <Input 
                      value={planForm.name} 
                      onChange={e => setPlanForm({...planForm, name: e.target.value})} 
                      placeholder="e.g. Enterprise"
                      className="mt-1 bg-card border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Description</Label>
                    <Input 
                      value={planForm.description} 
                      onChange={e => setPlanForm({...planForm, description: e.target.value})} 
                      placeholder="Brief summary of the tier"
                      className="mt-1 bg-card border-border"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Monthly Price ($)</Label>
                      <div className="relative mt-1">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input 
                          type="number" 
                          value={planForm.price_monthly} 
                          onChange={e => setPlanForm({...planForm, price_monthly: e.target.value})} 
                          className="pl-9 bg-card border-border"
                        />
                      </div>
                    </div>
                    <div>
                       <Label className="text-xs font-semibold">Status</Label>
                       <div className="flex items-center gap-2 mt-3">
                         <Checkbox 
                           id="plan-active" 
                           checked={planForm.is_active} 
                           onCheckedChange={c => setPlanForm({...planForm, is_active: c})} 
                         />
                         <Label htmlFor="plan-active" className="text-sm cursor-pointer">Active / Visible</Label>
                       </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold flex items-center gap-2">
                      Stripe Price ID 
                      <Badge variant="outline" className="text-[8px] bg-indigo-50 text-indigo-600 border-indigo-200">Optional</Badge>
                    </Label>
                    <Input 
                      value={planForm.stripe_price_id} 
                      onChange={e => setPlanForm({...planForm, stripe_price_id: e.target.value})} 
                      placeholder="price_1ABC123..."
                      className="mt-1 bg-card border-border font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Link to a Stripe product for automated billing.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Included Modules</Label>
              <div className="bg-secondary/30 p-4 rounded-2xl border border-border h-[320px] overflow-y-auto custom-scrollbar space-y-2">
                {ALL_MODULE_KEYS.map(key => {
                  const mod = MODULE_DEFINITIONS[key];
                  const checked = planForm.features.includes(key);
                  return (
                    <div 
                      key={key}
                      onClick={() => setPlanForm(prev => ({
                        ...prev,
                        features: checked ? prev.features.filter(k => k !== key) : [...prev.features, key]
                      }))}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                        checked ? "bg-brand/10 border-brand/50 shadow-sm" : "bg-card border-border hover:border-brand/30"
                      )}
                    >
                      <Checkbox checked={checked} className={cn("border-border", checked && "border-brand bg-brand text-black")} />
                      <span className={cn("text-xs font-bold", checked ? "text-foreground" : "text-muted-foreground")}>{mod?.label || key}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border mt-4">
            <Button variant="ghost" onClick={() => setShowPlanDialog(false)}>Cancel</Button>
            <Button 
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-8" 
              onClick={handleSavePlan}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
