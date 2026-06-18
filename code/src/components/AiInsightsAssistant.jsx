import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const AiInsights = React.lazy(() => import('@/pages/AiInsights'));

export default function AiInsightsAssistant() {
  return (
    <Sheet>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-brand text-primary-foreground shadow-[0_10px_30px_rgba(20,198,203,0.35)] hover:bg-brand/90"
                aria-label="Open AI Insights"
              >
                <Sparkles className="h-6 w-6" />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">AI Insights</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <SheetContent className="w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:max-w-2xl lg:max-w-4xl">
        <SheetHeader className="sr-only">
          <SheetTitle>AI Insights</SheetTitle>
          <SheetDescription>
            Restaurant operations insights, alerts, and recommended actions.
          </SheetDescription>
        </SheetHeader>
        <React.Suspense
          fallback={
            <div className="flex min-h-[360px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          }
        >
          <AiInsights />
        </React.Suspense>
      </SheetContent>
    </Sheet>
  );
}
