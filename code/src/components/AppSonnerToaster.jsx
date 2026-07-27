import React from 'react';
import { Toaster } from 'sonner';

export default function AppSonnerToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-popover text-popover-foreground shadow-lg',
          title: 'text-popover-foreground',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton: 'bg-popover text-popover-foreground border-border',
        },
      }}
    />
  );
}
