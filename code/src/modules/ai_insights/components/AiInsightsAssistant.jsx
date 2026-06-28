import React, { useEffect, useState } from 'react';
import { MessageSquare, Sparkles, X } from 'lucide-react';
import AiInsightsCopilotChat from '@/modules/ai_insights/components/AiInsightsCopilotChat';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const OPEN_STORAGE_KEY = 'restops_ai_insights_assistant_open';

export default function AiInsightsAssistant() {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(isOpen));
    } catch {
      // Ignore storage failures.
    }
  }, [isOpen]);

  if (isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-background shadow-2xl sm:w-[348px]">
        <div className="flex h-12 items-center justify-between border-b border-border/60 bg-background px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10">
              <Sparkles className="h-4 w-4 text-brand" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-foreground">AI Copilot</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">Scoped to current context</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setIsOpen(false)}
            aria-label="Close AI Copilot"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <AiInsightsCopilotChat
          compact
          showHeader={false}
          storageKey="restops_ai_insights_assistant_history"
          className="rounded-none border-0 shadow-none"
        />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-brand text-primary-foreground shadow-[0_10px_28px_rgba(255,92,43,0.28)] hover:bg-brand/90"
            aria-label="Open AI Copilot"
            onClick={() => setIsOpen(true)}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">AI Copilot</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
