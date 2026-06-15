import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Lightbulb, MessageSquare, Send, User } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { sendGeminiMessage } from '@/lib/geminiService';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { filterByContext } from '@/lib/contextUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

const starterPrompts = [
  'What should I prep more of today?',
  'Which invoices or card transactions need review?',
  'Where is food cost trending above target?',
  'What should my manager check before close?',
];

export default function AskTom() {
  const { user, organization, brand, location, activeBrand, activeLocation } = useAuth();
  const scopedBrand = activeBrand || brand;
  const scopedLocation = activeLocation || location;
  const context = { organization, brand: scopedBrand, location: scopedLocation };
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [isThinking, setIsThinking] = useState(false);

  const { data: threads = [] } = useAuthQuery({
    queryKey: ['ask-tom-threads', organization?.id],
    queryFn: () => api.entities.AskTomThread.list('-updated_at'),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });

  const selectedThreadId = activeThreadId || threads[0]?.id || null;

  const { data: messages = [] } = useAuthQuery({
    queryKey: ['ask-tom-messages', selectedThreadId],
    queryFn: () => api.entities.AskTomMessage.filter({ thread_id: selectedThreadId }),
    enabled: !!selectedThreadId,
  });

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages]);

  const { data: sales = [] } = useAuthQuery({
    queryKey: ['ask-tom-sales', organization?.id],
    queryFn: () => api.entities.PosSalesData.list('-date', { limit: 60 }),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });

  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['ask-tom-invoices', organization?.id],
    queryFn: () => api.entities.Invoice.list('-created_at', { limit: 40 }),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });

  const { data: prepPlans = [] } = useAuthQuery({
    queryKey: ['ask-tom-smart-prep', organization?.id],
    queryFn: () => api.entities.SmartPrepPlan.list('-prep_date', { limit: 40 }),
    select: React.useCallback((data) => filterByContext(data, context), [organization, scopedBrand, scopedLocation]),
    enabled: !!organization?.id,
  });



  const createThreadMutation = useMutation({
    mutationFn: (payload) => api.entities.AskTomThread.create(payload),
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: ['ask-tom-threads'] });
      setActiveThreadId(thread.id);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: (payload) => api.entities.AskTomMessage.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ask-tom-messages'] });
    },
  });

  const updateThreadMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.AskTomThread.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ask-tom-threads'] }),
  });

  const ensureThread = async (question) => {
    if (selectedThreadId) return selectedThreadId;
    const title = question.length > 54 ? `${question.slice(0, 54)}...` : question;
    const thread = await createThreadMutation.mutateAsync({
      organization_id: organization?.id,
      brand_id: scopedBrand?.id || null,
      location_id: scopedLocation?.id || null,
      title,
      status: 'open',
      created_by: user?.id,
    });
    return thread.id;
  };

  const buildContext = () => ({
    scopeType: scopedLocation ? 'Location' : scopedBrand ? 'Brand' : 'Organization',
    scopeName: scopedLocation?.name || scopedBrand?.name || organization?.name || 'Current restaurant',
    metrics: {
      sales: sales.slice(0, 40),
      invoices: invoices.slice(0, 30),
      smartPrep: prepPlans.slice(0, 30),
    },
  });

  const handleSend = async (promptOverride) => {
    const question = (promptOverride || input).trim();
    if (!question) return;
    setInput('');
    setIsThinking(true);

    try {
      const threadId = await ensureThread(question);
      const contextData = buildContext();
      await createMessageMutation.mutateAsync({
        thread_id: threadId,
        organization_id: organization?.id,
        role: 'user',
        content: question,
        context_snapshot: contextData,
        created_by: user?.id,
      });

      const history = sortedMessages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      }));

      let answer;
      try {
        answer = await sendGeminiMessage(history, question, contextData);
      } catch (error) {
        answer = `I could not reach the AI engine right now. Based on the synced context I can still see ${prepPlans.length} prep plans, and ${invoices.length} recent invoices in scope. ${error.message || ''}`.trim();
      }

      await createMessageMutation.mutateAsync({
        thread_id: threadId,
        organization_id: organization?.id,
        role: 'assistant',
        content: answer,
        context_snapshot: contextData,
      });
      await updateThreadMutation.mutateAsync({ id: threadId, data: { title: question.slice(0, 80), updated_at: new Date().toISOString() } });
    } catch (error) {
      toast.error(error.message || 'Ask Tom could not send the message');
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-brand" />
            Ask Tom
          </h1>
          <p className="text-muted-foreground mt-1">Ask operational questions across prep, invoices, sales, and labor context.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setActiveThreadId(null);
            setInput('');
          }}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          New Thread
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Threads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThreadId(thread.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selectedThreadId === thread.id ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-secondary'}`}
              >
                <span className="line-clamp-2 font-medium">{thread.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{new Date(thread.updated_at || thread.created_at).toLocaleString()}</span>
              </button>
            ))}
            {threads.length === 0 && <p className="text-sm text-muted-foreground">No Ask Tom threads yet.</p>}
          </CardContent>
        </Card>

        <Card className="min-h-[640px] flex flex-col">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-brand" />
                Restaurant Copilot
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{scopedLocation ? scopedLocation.name : scopedBrand ? scopedBrand.name : organization?.name || 'Org'}</Badge>
                <Badge className="bg-brand/10 text-brand">Context aware</Badge>
              </div>
            </div>
          </CardHeader>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {sortedMessages.length === 0 && (
                <div className="space-y-4 py-8">
                  <div className="text-center text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-3 text-brand" />
                    <p className="font-medium text-foreground">Ask Tom is ready.</p>
                    <p className="text-sm">Choose a starter or type a question about this restaurant context.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {starterPrompts.map((prompt) => (
                      <Button key={prompt} variant="outline" className="justify-start whitespace-normal h-auto py-3" onClick={() => handleSend(prompt)}>
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {sortedMessages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role !== 'user' && <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-brand" /></div>}
                  <div className={`max-w-[85%] rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                    {message.content}
                  </div>
                  {message.role === 'user' && <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><User className="h-4 w-4 text-primary" /></div>}
                </div>
              ))}

              {isThinking && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-brand" /></div>
                  <div className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">Tom is checking your restaurant context...</div>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="border-t border-border p-4">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about prep, invoices, purchases, sales, or manager follow-ups..."
                disabled={isThinking}
              />
              <Button type="submit" disabled={!input.trim() || isThinking}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
