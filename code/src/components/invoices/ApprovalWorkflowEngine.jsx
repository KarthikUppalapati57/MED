import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export function ApprovalWorkflowEngine({ invoice }) {
  const { user, userProfile } = useAuth();
  const currentRole = userProfile?.role || 'user';
  const queryClient = useQueryClient();
  const [comments, setComments] = useState('');

  // Fetch the active instance and its steps
  const { data: instanceData, isLoading } = useQuery({
    queryKey: ['approval-workflow', invoice.id],
    queryFn: async () => {
      const { data: instances, error: instErr } = await supabase
        .from('approval_instances')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (instErr) throw instErr;
      if (!instances || instances.length === 0) return null;
      
      const instance = instances[0];
      
      const { data: steps, error: stepErr } = await supabase
        .from('approval_steps')
        .select(`
          *,
          approver:approver_id (
            email,
            user_metadata
          )
        `)
        .eq('instance_id', instance.id)
        .order('created_at', { ascending: true });
        
      if (stepErr) throw stepErr;

      return { ...instance, steps };
    },
    enabled: !!invoice.id && invoice.status === 'pending_approval'
  });

  const executeStepMutation = useMutation({
    mutationFn: async ({ stepId, status }) => {
      const { data, error } = await supabase.rpc('execute_approval_step', {
        p_step_id: stepId,
        p_status: status,
        p_comments: comments
      });
      if (error) throw error;
      return data;
    },
    // Optimistic Update Implementation
    onMutate: async ({ stepId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['approval-workflow', invoice.id] });
      const previousData = queryClient.getQueryData(['approval-workflow', invoice.id]);

      // Optimistically update the UI to reflect the pending action
      if (previousData) {
        queryClient.setQueryData(['approval-workflow', invoice.id], {
          ...previousData,
          steps: previousData.steps.map(step => 
            step.id === stepId 
              ? { ...step, status, comments, acted_at: new Date().toISOString() }
              : step
          ),
          status: status === 'rejected' ? 'rejected' : previousData.status // Simplified optimistic status
        });
      }

      return { previousData };
    },
    onError: (err, newStep, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['approval-workflow', invoice.id], context.previousData);
      }
      toast.error('Failed to execute approval: ' + err.message);
    },
    onSuccess: (data) => {
      toast.success(`Invoice ${data.status.replace('_', ' ')}`);
      setComments('');
      window.dispatchEvent(new CustomEvent('invoice-updated'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-workflow', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  });

  if (invoice.status !== 'pending_approval' && invoice.status !== 'approved' && invoice.status !== 'rejected') return null;
  if (isLoading) return <div className="p-4 text-slate-500 animate-pulse">Loading approval workflow...</div>;
  if (!instanceData) return null;

  // Check if current user can approve any pending steps
  const pendingSteps = instanceData.steps.filter(s => s.status === 'pending');
  
  // "Any one higher role have to approve" - we find steps that match current user's role
  const myActionableSteps = pendingSteps.filter(s => s.required_role === currentRole);
  const canApprove = myActionableSteps.length > 0;

  const handleAction = (status) => {
    if (!canApprove) return;
    // We approve the first actionable step for this role
    executeStepMutation.mutate({ stepId: myActionableSteps[0].id, status });
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'approved': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'rejected': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending': return <Clock className="h-5 w-5 text-amber-500" />;
      default: return <AlertTriangle className="h-5 w-5 text-slate-500" />;
    }
  };

  return (
    <Card className={`border-2 ${instanceData.status === 'approved' ? 'border-green-200' : instanceData.status === 'rejected' ? 'border-red-200' : 'border-amber-200'}`}>
      <CardHeader className="bg-slate-50 border-b pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-teal-600" />
          Approval Workflow
          {instanceData.status === 'approved' && <span className="ml-auto text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">Fully Approved</span>}
          {instanceData.status === 'rejected' && <span className="ml-auto text-sm bg-red-100 text-red-800 px-2 py-1 rounded-full">Rejected</span>}
          {instanceData.status === 'pending' && <span className="ml-auto text-sm bg-amber-100 text-amber-800 px-2 py-1 rounded-full">Pending Approval</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-slate-500">Required Approvals</h4>
          {instanceData.steps.map((step, i) => (
            <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white shadow-sm">
              <div className="mt-0.5">{getStatusIcon(step.status)}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize">{step.required_role.replace('_', ' ')} Approval</span>
                  <span className="text-xs text-slate-500">
                    {step.acted_at ? new Date(step.acted_at).toLocaleString() : 'Waiting...'}
                  </span>
                </div>
                {step.status !== 'pending' && step.approver && (
                  <p className="text-sm text-slate-600 mt-1">
                    By: {step.approver.user_metadata?.full_name || step.approver.email}
                  </p>
                )}
                {step.comments && (
                  <p className="text-sm italic text-slate-500 mt-2 bg-slate-50 p-2 rounded">
                    "{step.comments}"
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {instanceData.status === 'pending' && (
          <div className="pt-4 border-t">
            {canApprove ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Your Action Required</p>
                <Textarea 
                  placeholder="Add optional comments before approving or rejecting..." 
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="bg-white"
                />
                <div className="flex gap-3">
                  <Button 
                    onClick={() => handleAction('approved')} 
                    disabled={executeStepMutation.isPending}
                    className="flex-1 bg-teal-600 hover:bg-teal-700"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => handleAction('rejected')} 
                    disabled={executeStepMutation.isPending}
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 text-amber-800 p-3 rounded text-sm text-center">
                Waiting on other roles to approve. Your current role ({currentRole}) is not required for the pending steps.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
