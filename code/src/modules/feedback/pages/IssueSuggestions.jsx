import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Lightbulb, Loader2, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

const FEEDBACK_COPY = {
  issue: {
    label: 'Issue',
    icon: AlertCircle,
    tone: 'text-rose-600 bg-rose-50 border-rose-100',
    title: 'Raise an Issue',
    subjectPlaceholder: 'Example: Invoice upload is failing',
    messagePlaceholder: 'Tell us what happened, what you expected, and any steps that reproduce the problem.',
    success: 'Issue sent to the support team.',
  },
  suggestion: {
    label: 'Suggestion',
    icon: Lightbulb,
    tone: 'text-amber-700 bg-amber-50 border-amber-100',
    title: 'Share a Suggestion',
    subjectPlaceholder: 'Example: Add a weekly vendor spend comparison',
    messagePlaceholder: 'Describe the idea, the workflow it improves, and who would benefit from it.',
    success: 'Suggestion sent to the product team.',
  },
};

const initialDraft = { subject: '', message: '', priority: 'normal' };

function FeedbackForm({ type }) {
  const config = FEEDBACK_COPY[type];
  const Icon = config.icon;
  const [draft, setDraft] = React.useState(initialDraft);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('submit-client-feedback', {
        body: {
          type,
          subject: draft.subject.trim(),
          message: draft.message.trim(),
          priority: draft.priority,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(config.success);
      setDraft(initialDraft);
    },
    onError: (error) => toast.error(error.message || 'Unable to submit right now'),
  });

  const canSubmit = draft.subject.trim().length >= 4 && draft.message.trim().length >= 10 && !mutation.isPending;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg border', config.tone)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-foreground">{config.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Your message is emailed directly to the configured Restops team recipients.</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 rounded-md px-3 py-1 text-xs">
            <Mail className="h-3.5 w-3.5" />
            Direct email
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        <div className="grid gap-5 md:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor={`${type}-subject`}>Subject</Label>
            <Input
              id={`${type}-subject`}
              value={draft.subject}
              onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
              placeholder={config.subjectPlaceholder}
              className="h-11"
              maxLength={140}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}-priority`}>{type === 'issue' ? 'Priority' : 'Impact'}</Label>
            <select
              id={`${type}-priority`}
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${type}-message`}>Details</Label>
          <Textarea
            id={`${type}-message`}
            value={draft.message}
            onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
            placeholder={config.messagePlaceholder}
            className="min-h-48 resize-y"
            maxLength={4000}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Minimum 10 characters</span>
            <span>{draft.message.length}/4000</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            A record is saved for follow-up after submission.
          </div>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()} className="h-10 w-full sm:w-auto">
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send {config.label}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IssueSuggestions() {
  const [activeTab, setActiveTab] = React.useState('issue');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Issue & Suggestions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Send complaints, blockers, and product ideas to the Restops team.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="h-10 w-full justify-start overflow-x-auto rounded-lg md:w-fit">
          <TabsTrigger value="issue" className="gap-2 px-4">
            <AlertCircle className="h-4 w-4" />
            Issue
          </TabsTrigger>
          <TabsTrigger value="suggestion" className="gap-2 px-4">
            <Lightbulb className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="issue" className="mt-0">
          <FeedbackForm type="issue" />
        </TabsContent>
        <TabsContent value="suggestion" className="mt-0">
          <FeedbackForm type="suggestion" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
