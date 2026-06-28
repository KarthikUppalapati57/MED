import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
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
import { Plus, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ApprovalPolicySettings() {
  const { user, organization } = useAuth();
  const queryClient = useQueryClient();
  
  const [isAdding, setIsAdding] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    min_amount: '',
    max_amount: '',
    required_role: 'org_admin'
  });

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['approval-policies', organization?.id],
    queryFn: () => api.entities.ApprovalPolicy.filter(
      { organization_id: organization.id },
      { orderBy: 'min_amount' }
    ),
    enabled: !!organization?.id
  });

  const createPolicyMutation = useMutation({
    mutationFn: (policy) => api.entities.ApprovalPolicy.create({
      organization_id: organization.id,
      min_amount: policy.min_amount ? parseFloat(policy.min_amount) : 0,
      max_amount: policy.max_amount ? parseFloat(policy.max_amount) : null,
      required_role: policy.required_role
    }),
    onSuccess: () => {
      toast.success("Approval policy created");
      queryClient.invalidateQueries({ queryKey: ['approval-policies'] });
      setIsAdding(false);
      setNewPolicy({ min_amount: '', max_amount: '', required_role: 'org_admin' });
    },
    onError: (err) => toast.error(err.message)
  });

  const deletePolicyMutation = useMutation({
    mutationFn: (id) => api.entities.ApprovalPolicy.delete(id),
    onSuccess: () => {
      toast.success("Policy removed");
      queryClient.invalidateQueries({ queryKey: ['approval-policies'] });
    },
    onError: (err) => toast.error(err.message)
  });

  const handleAdd = () => {
    if (!newPolicy.required_role) return toast.error("Role is required");
    createPolicyMutation.mutate(newPolicy);
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading policies...</div>;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-teal-600" />
          Invoice Approval Policies
        </CardTitle>
        <CardDescription>
          Configure the rules engine that determines who must approve an invoice before it can be paid.
          Multiple rules can trigger simultaneously for parallel approvals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="space-y-4">
          {policies.map(policy => (
            <div key={policy.id} className="flex items-center justify-between p-4 bg-slate-50 border rounded-lg">
              <div>
                <p className="font-semibold text-slate-900 capitalize text-sm">
                  Requires {policy.required_role.replace('_', ' ')}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  When invoice total is &ge; ${parseFloat(policy.min_amount || 0).toFixed(2)}
                  {policy.max_amount ? ` and \u2264 $${parseFloat(policy.max_amount).toFixed(2)}` : ' (No maximum)'}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => deletePolicyMutation.mutate(policy.id)}
                disabled={deletePolicyMutation.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {policies.length === 0 && !isAdding && (
            <div className="text-center p-6 border border-dashed rounded-lg text-slate-500 text-sm">
              No approval policies configured. All invoices will be auto-approved!
            </div>
          )}
        </div>

        {isAdding ? (
          <div className="p-4 border rounded-lg bg-teal-50/50 space-y-4">
            <h4 className="text-sm font-semibold text-teal-900">New Policy Rule</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Minimum Amount ($)</Label>
                <Input 
                  type="number" 
                  value={newPolicy.min_amount} 
                  onChange={e => setNewPolicy({...newPolicy, min_amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Maximum Amount ($) Optional</Label>
                <Input 
                  type="number" 
                  value={newPolicy.max_amount} 
                  onChange={e => setNewPolicy({...newPolicy, max_amount: e.target.value})}
                  placeholder="No limit"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Required Role</Label>
                <Select value={newPolicy.required_role} onValueChange={v => setNewPolicy({...newPolicy, required_role: v})}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="location_manager">Location Manager</SelectItem>
                    <SelectItem value="manager">General Manager</SelectItem>
                    <SelectItem value="org_admin">Org Admin</SelectItem>
                    <SelectItem value="org_owner">Org Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button 
                size="sm" 
                className="bg-teal-600 hover:bg-teal-700" 
                onClick={handleAdd}
                disabled={createPolicyMutation.isPending}
              >
                {createPolicyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Save Rule"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Approval Rule
          </Button>
        )}

      </CardContent>
    </Card>
  );
}
