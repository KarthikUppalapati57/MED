import React, { useMemo } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANT_ICONS = {
  destructive: Trash2,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
};

const VARIANT_BUTTON_CLASSES = {
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  info: 'bg-primary text-primary-foreground hover:bg-primary/90',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

export const ConfirmationDialog = ({
  isOpen,
  config,
  onConfirm,
  onCancel,
}) => {
  if (!config || !isOpen) {
    return null;
  }

  const {
    title,
    description,
    confirmText,
    cancelText,
    variant = 'destructive',
    icon: customIcon,
    isLoading = false,
    ariaLabel,
    severity,
  } = config;

  const DefaultIcon = VARIANT_ICONS[variant] || VARIANT_ICONS.destructive;
  const Icon = customIcon || DefaultIcon;
  const buttonClass = VARIANT_BUTTON_CLASSES[variant] || VARIANT_BUTTON_CLASSES.destructive;

  const handleConfirm = async () => {
    if (config._onConfirm) {
      try {
        await config._onConfirm();
      } catch (error) {
        console.error('Error in confirmation:', error);
        // Don't close dialog if there's an error
        return;
      }
    }
  };

  const handleCancel = () => {
    if (config._onCancel) {
      config._onCancel();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      }
    }}>
      <AlertDialogContent
        aria-label={ariaLabel || title}
        className="max-w-md"
      >
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {Icon && (
              <Icon
                className={cn(
                  'h-5 w-5 mt-0.5 flex-shrink-0',
                  variant === 'destructive' && 'text-destructive',
                  variant === 'warning' && 'text-amber-600',
                  variant === 'info' && 'text-primary',
                  variant === 'success' && 'text-emerald-600'
                )}
                aria-hidden="true"
              />
            )}
            <div className="flex-1">
              <AlertDialogTitle className={cn(
                variant === 'destructive' && 'text-foreground',
                variant === 'warning' && 'text-foreground',
                variant === 'info' && 'text-foreground',
                variant === 'success' && 'text-foreground'
              )}>
                {title}
              </AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>

        {description && (
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {description}
          </AlertDialogDescription>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={handleCancel}
            className="mt-2 sm:mt-0"
            disabled={isLoading}
          >
            {cancelText}
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(buttonClass)}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

