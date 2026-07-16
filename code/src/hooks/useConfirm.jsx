import { useState, useCallback, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// Render <ConfirmDialog /> once in the component tree, then `await confirm({...})`
// wherever a destructive action needs confirmation. Resolves true/false.
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setOptions({
        title: opts?.title || 'Are you sure?',
        description: opts?.description || 'This action cannot be undone.',
        confirmLabel: opts?.confirmLabel || 'Delete',
        destructive: opts?.destructive ?? true,
      });
    });
  }, []);

  const handleOpenChange = useCallback((open) => {
    if (!open) {
      resolver.current?.(false);
      setOptions(null);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    resolver.current?.(true);
    setOptions(null);
  }, []);

  const ConfirmDialog = useCallback(() => (
    <AlertDialog open={!!options} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={options?.destructive ? 'bg-resend-red hover:bg-resend-red/90 text-white' : undefined}
          >
            {options?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ), [options, handleOpenChange, handleConfirm]);

  return { confirm, ConfirmDialog };
}
