import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Send, User } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const DEFAULT_HISTORY = [
  {
    role: 'assistant',
    content: 'I can help analyze the restaurant data in your current context. Switch organization, brand, or location to change what I can see.',
  },
];

async function getFunctionErrorMessage(error) {
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.clone().json();
      return body?.error || body?.message || error.message;
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch {
        return error.message;
      }
    }
  }
  return error?.message || 'AI Insights Copilot could not answer right now.';
}

function readStoredHistory(storageKey) {
  if (!storageKey || typeof sessionStorage === 'undefined') return DEFAULT_HISTORY;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return DEFAULT_HISTORY;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_HISTORY;
  } catch {
    return DEFAULT_HISTORY;
  }
}

export default function AiInsightsCopilotChat({ className, compact = false, showHeader = true, storageKey }) {
  const { organization, brand, location } = useAuth();
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState(() => readStoredHistory(storageKey));
  const [isChatLoading, setIsChatLoading] = useState(false);

  const scopeLabel = location?.name || brand?.name || organization?.name || 'Current context';
  const scrollHeight = compact ? 'h-[292px] sm:h-[312px]' : 'h-[520px]';

  useEffect(() => {
    if (!storageKey || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(chatHistory.slice(-20)));
    } catch {
      // Non-critical. Chat can continue without persisted history.
    }
  }, [chatHistory, storageKey]);

  const scopedContext = useMemo(() => ({
    organizationId: organization?.id || null,
    brandId: brand?.brand_id || brand?.id || null,
    locationId: location?.id || null,
  }), [organization?.id, brand?.brand_id, brand?.id, location?.id]);

  const handleSendChatMessage = async (event) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || isChatLoading) return;
    if (!scopedContext.organizationId) {
      toast.error('Select an organization before using AI Insights Copilot');
      return;
    }

    const nextHistory = [...chatHistory, { role: 'user', content: message }];
    setChatHistory(nextHistory);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const historyForFunction = nextHistory
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .slice(-8);

      const { data, error } = await supabase.functions.invoke('ai-insights-chat', {
        body: {
          message,
          history: historyForFunction,
          context: scopedContext,
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: data?.reply || 'I could not generate an answer from the available context.',
      }]);
    } catch (err) {
      console.error('AI Insights Copilot error:', err);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: err.message || 'AI Insights Copilot could not answer right now.',
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <Card className={cn('glass-card border border-border/50 shadow-sm overflow-hidden', className)}>
      <CardContent className="p-0">
        {showHeader && (
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground leading-tight">AI Insights Copilot</p>
                <p className="text-xs text-muted-foreground truncate">Scope: {scopeLabel}</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-brand/10 text-brand border-0">Scoped</Badge>
          </div>
        )}

        <ScrollArea className={cn(scrollHeight, compact ? 'px-3 py-3' : 'p-4')}>
          <div className={cn(compact ? 'space-y-3 pb-3' : 'space-y-4 pb-4')}>
            {chatHistory.map((msg, index) => (
              <div key={`${msg.role}-${index}`} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className={cn('rounded-full bg-brand/10 flex items-center justify-center shrink-0', compact ? 'h-7 w-7' : 'h-8 w-8')}>
                    <Bot className={cn('text-brand', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                  </div>
                )}
                <div className={cn(
                  'max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 leading-relaxed',
                  compact ? 'text-[13px]' : 'text-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-secondary text-secondary-foreground rounded-tl-sm'
                )}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className={cn('rounded-full bg-primary/10 flex items-center justify-center shrink-0', compact ? 'h-7 w-7' : 'h-8 w-8')}>
                    <User className={cn('text-primary', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                  </div>
                )}
              </div>
            ))}
            {isChatLoading && (
              <div className="flex gap-2 justify-start">
                <div className={cn('rounded-full bg-brand/10 flex items-center justify-center shrink-0', compact ? 'h-7 w-7' : 'h-8 w-8')}>
                  <Bot className={cn('text-brand', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                </div>
                <div className={cn('bg-secondary text-secondary-foreground rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-2', compact ? 'text-[13px]' : 'text-sm')}>
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  Reviewing scoped data
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <form onSubmit={handleSendChatMessage} className={cn('flex gap-2 border-t border-border/50', compact ? 'p-2.5' : 'p-3')}>
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={compact ? 'Ask about this location...' : 'Ask about invoices, sales, prep, inventory, vendors, or labor...'}
            className={cn('flex-1 bg-background/60', compact && 'h-9 text-sm')}
          />
          <Button type="submit" size="icon" className={compact ? 'h-9 w-9' : undefined} disabled={!chatInput.trim() || isChatLoading}>
            {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
