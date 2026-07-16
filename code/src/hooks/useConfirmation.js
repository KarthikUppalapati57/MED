import { useContext } from 'react';
import { ConfirmationContext } from '@/contexts/ConfirmationContext';

export const useConfirmation = () => {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error('useConfirmation must be used within ConfirmationProvider');
  }

  const confirm = async (config) => {
    // Validate required fields
    if (!config.title) {
      throw new Error('Confirmation title is required');
    }

    // Set defaults
    const fullConfig = {
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      variant: 'destructive',
      severity: 'high',
      icon: null,
      isLoading: false,
      ariaLabel: config.title,
      metadata: {},
      ...config,
    };

    // Call onConfirm if provided before resolving
    const handleConfirm = async () => {
      if (fullConfig.onConfirm) {
        try {
          await fullConfig.onConfirm();
        } catch (error) {
          console.error('Error in onConfirm:', error);
          throw error;
        }
      }
      context.hide(true);
      return true;
    };

    // Handle cancel
    const handleCancel = () => {
      if (fullConfig.onCancel) {
        fullConfig.onCancel();
      }
      context.hide(false);
      return false;
    };

    // Store handlers and config in context
    fullConfig._onConfirm = handleConfirm;
    fullConfig._onCancel = handleCancel;

    // Show dialog and wait for result
    const result = await context.show(fullConfig);
    return result;
  };

  return { confirm, ...context };
};
