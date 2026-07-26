import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Mail, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseClient';

const DEFAULT_SETTINGS = {
  issue_to: ['pradeepk@mindfultechsol.com'],
  issue_cc: ['karthiku@mindfultechsol.com', 'Narendrapydi@mindfultechsol.com'],
  suggestion_to: ['Karthiku@MIndfultechsol.com'],
  suggestion_cc: ['Narendrapydi@mindfultechsol.com'],
};

const parseEmails = (value) => String(value || '')
  .split(/[\n,;]/)
  .map((email) => email.trim())
  .filter(Boolean);

const formatEmails = (value) => (Array.isArray(value) ? value : []).join('\n');

const hasInvalidEmails = (emails) => emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

function RecipientTextarea({ id, label, value, onChange, hint }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="name@example.com"
        className="min-h-24 resize-y font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">{hint || 'Use one email per line, or separate addresses with commas.'}</p>
    </div>
  );
}

export default function PlatformFeedbackSettings() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState({
    issue_to: '',
    issue_cc: '',
    suggestion_to: '',
    suggestion_cc: '',
  });

  const { data: settings = DEFAULT_SETTINGS, isLoading } = useQuery({
    queryKey: ['platform-feedback-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_platform_feedback_settings');
      if (error) throw error;
      return data || DEFAULT_SETTINGS;
    },
  });

  React.useEffect(() => {
    setDraft({
      issue_to: formatEmails(settings.issue_to || DEFAULT_SETTINGS.issue_to),
      issue_cc: formatEmails(settings.issue_cc || DEFAULT_SETTINGS.issue_cc),
      suggestion_to: formatEmails(settings.suggestion_to || DEFAULT_SETTINGS.suggestion_to),
      suggestion_cc: formatEmails(settings.suggestion_cc || DEFAULT_SETTINGS.suggestion_cc),
    });
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        p_issue_to: parseEmails(draft.issue_to),
        p_issue_cc: parseEmails(draft.issue_cc),
        p_suggestion_to: parseEmails(draft.suggestion_to),
        p_suggestion_cc: parseEmails(draft.suggestion_cc),
      };

      if (payload.p_issue_to.length === 0) throw new Error('Issue To must include at least one email.');
      if (payload.p_suggestion_to.length === 0) throw new Error('Suggestion To must include at least one email.');
      const allEmails = [...payload.p_issue_to, ...payload.p_issue_cc, ...payload.p_suggestion_to, ...payload.p_suggestion_cc];
      if (hasInvalidEmails(allEmails)) throw new Error('One or more recipient emails are invalid.');

      const { data, error } = await supabase.rpc('update_platform_feedback_settings', payload);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-feedback-settings'] });
      toast.success('Issue & Suggestions recipients updated');
    },
    onError: (error) => toast.error(error.message || 'Failed to save recipients'),
  });

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-700">
                <Settings2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Issue & Suggestions Email Routing</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Set the platform recipients used when clients submit complaints or suggestions.</p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit gap-1.5 rounded-md px-3 py-1 text-xs">
              <Mail className="h-3.5 w-3.5" />
              Resend delivery
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading recipient settings...
            </div>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-lg border border-border/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    Issue Tab
                  </div>
                  <RecipientTextarea id="issue-to" label="To" value={draft.issue_to} onChange={(value) => setDraft((current) => ({ ...current, issue_to: value }))} />
                  <RecipientTextarea id="issue-cc" label="CC" value={draft.issue_cc} onChange={(value) => setDraft((current) => ({ ...current, issue_cc: value }))} />
                </div>
                <div className="space-y-4 rounded-lg border border-border/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Mail className="h-4 w-4 text-amber-700" />
                    Suggestions Tab
                  </div>
                  <RecipientTextarea id="suggestion-to" label="To" value={draft.suggestion_to} onChange={(value) => setDraft((current) => ({ ...current, suggestion_to: value }))} />
                  <RecipientTextarea id="suggestion-cc" label="CC" value={draft.suggestion_cc} onChange={(value) => setDraft((current) => ({ ...current, suggestion_cc: value }))} />
                </div>
              </div>
              <div className="flex justify-end border-t border-border/70 pt-5">
                <Button disabled={mutation.isPending} onClick={() => mutation.mutate()} className="h-10 px-5">
                  {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Recipients
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
