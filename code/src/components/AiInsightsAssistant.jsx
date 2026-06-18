import React, { useEffect, useState } from 'react';
import { Maximize2, MessageSquare, Minus, Sparkles, X } from 'lucide-react';
import AiInsightsCopilotChat from '@/components/AiInsightsCopilotChat';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const OPEN_STORAGE_KEY = 'restops_ai_insights_assistant_open';
const SIZE_STORAGE_KEY = 'restops_ai_insights_assistant_expanded';

export default function AiInsightsAssistant() {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem(SIZE_STORAGE_KEY) === 'true';
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

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_STORAGE_KEY, String(isExpanded));
    } catch {
      // Ignore storage failures.
    }
  }, [isExpanded]);

  if (isOpen) {
    return (
      <div
        className={cn(
          'fixed bottom-4 right-4 z-40 overflow-hidden rounded-lg border border-border bg-background shadow-2xl',
          'w-[calc(100vw-2rem)] sm:w-[380px]',
          isExpanded && 'sm:w-[520px]'
        )}
      >
        <div className="flex h-11 items-center justify-between border-b border-border/60 bg-background px-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-brand" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-none">AI Copilot</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Scoped to current context</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(prev => !prev)}
              aria-label={isExpanded ? 'Shrink AI Copilot' : 'Expand AI Copilot'}
            >
              {isExpanded ? <Minus className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsOpen(false)}
              aria-label="Close AI Copilot"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <AiInsightsCopilotChat
          compact
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
            className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-brand text-primary-foreground shadow-[0_10px_30px_rgba(20,198,203,0.35)] hover:bg-brand/90"
            aria-label="Open AI Copilot"
            onClick={() => setIsOpen(true)}
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">AI Copilot</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
