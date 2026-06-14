import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, AlertTriangle, MessageSquare, ArrowRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';

export function ActionCenterWidget() {
  const { organization, brand, location } = useAuth();
  const [selectedAction, setSelectedAction] = useState(null);
  const [insightText, setInsightText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Use AI Insights table as the backing for Action Center Tasks
  const { data: rawInsights, isLoading, refetch } = useAuthQuery({
    queryKey: ['ai_insights_actions', organization?.id],
    queryFn: () => api.entities.AiInsight.list('-created_at'),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location })
      .filter(i => i.metadata?.action), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const actions = rawInsights || [];

  const handleResolve = async (id) => {
    try {
      await api.entities.AiInsight.update(id, {
        metadata: { ...actions.find(a => a.id === id).metadata, status: 'resolved' }
      });
      toast.success("Action marked as resolved");
      refetch();
    } catch (e) {
      toast.error("Failed to resolve action");
    }
  };

  const handleSnooze = async (id) => {
    try {
      await api.entities.AiInsight.update(id, {
        metadata: { ...actions.find(a => a.id === id).metadata, status: 'snoozed' }
      });
      toast.success("Action snoozed for 24 hours");
      refetch();
    } catch (e) {
      toast.error("Failed to snooze action");
    }
  };

  const handleAiConsult = async (action) => {
    setSelectedAction(action);
    setInsightText("");
    setIsGenerating(true);
    
    // Simulate AI Analyst generating a specific breakdown
    setTimeout(() => {
      setInsightText(`Based on the variance data, ${action.title} is likely caused by a combination of a 4% invoice price increase from US Foods and a 2% increase in waste during prep. I recommend reviewing the latest US Foods invoice and checking the prep logs for the grill station.`);
      setIsGenerating(false);
    }, 1500);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading actionable insights...</div>;
  }

  const pendingActions = actions.filter(a => a.metadata?.status !== 'resolved' && a.metadata?.status !== 'snoozed');
  const snoozedActions = actions.filter(a => a.metadata?.status === 'snoozed');
  const resolvedActions = actions.filter(a => a.metadata?.status === 'resolved');

  const ActionRow = ({ action, isPending }) => (
    <TableRow key={action.id} className="hover:bg-slate-50/50 transition-colors">
      <TableCell>
        <div className="flex items-center gap-2">
          {action.severity === 'high' ? <AlertTriangle className="w-4 h-4 text-resend-red" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
          <span className="font-semibold">{action.title}</span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">{action.description}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {action.metadata?.action?.type?.replace(/_/g, ' ') || 'Investigation'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {action.metadata?.dollarImpact ? (
          <span className="font-semibold text-rose-600">-${action.metadata.dollarImpact}</span>
        ) : (
          <span className="text-muted-foreground">Unknown</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {isPending ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => handleAiConsult(action)}>
              <MessageSquare className="w-4 h-4 mr-2" /> Ask AI
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleSnooze(action.id)}>
              <Clock className="w-4 h-4" />
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleResolve(action.id)}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Resolve
            </Button>
          </div>
        ) : (
          <Badge className="bg-slate-100 text-slate-700 capitalize border-none">{action.metadata?.status}</Badge>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader>
          <CardTitle>Action Center</CardTitle>
          <CardDescription>AI-generated tasks to protect your margins and improve operational efficiency.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto w-full">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Task / Insight</TableHead>
                  <TableHead>Action Type</TableHead>
                  <TableHead className="text-right">Estimated Impact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingActions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      You're all caught up! No pending actions.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingActions.map(a => <ActionRow key={a.id} action={a} isPending={true} />)
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {(snoozedActions.length > 0 || resolvedActions.length > 0) && (
        <Card className="glass-card shadow-sm border-border/50 opacity-80">
          <CardHeader>
            <CardTitle className="text-base">Snoozed & Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto w-full">
              <Table className="w-full">
                <TableBody>
                  {[...snoozedActions, ...resolvedActions.slice(0, 5)].map(a => <ActionRow key={a.id} action={a} isPending={false} />)}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analyst Modal */}
      <Dialog open={!!selectedAction} onOpenChange={() => setSelectedAction(null)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand" />
              AI Performance Analyst
            </DialogTitle>
            <DialogDescription>
              Deep dive into: {selectedAction?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-slate-50 rounded-lg min-h-[120px] text-sm text-slate-800 border">
            {isGenerating ? (
              <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
                <div className="w-2 h-2 bg-brand rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-brand rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-brand rounded-full animate-bounce delay-150"></div>
                Analyzing variance data...
              </div>
            ) : (
              <p className="leading-relaxed">{insightText}</p>
            )}
          </div>
          <DialogFooter className="sm:justify-between items-center">
            <Button variant="ghost" onClick={() => setSelectedAction(null)}>Close</Button>
            <Button className="bg-brand text-white hover:bg-brand-dark" disabled={isGenerating}>
              Create Investigation Ticket <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
