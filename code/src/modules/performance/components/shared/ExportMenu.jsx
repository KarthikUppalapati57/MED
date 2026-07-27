import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function ExportMenu({ onExportCsv, disabled = false, label = 'Export' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={disabled ? `${label} unavailable` : label}
        >
          <Download className="w-4 h-4 mr-1.5" aria-hidden="true" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onExportCsv} disabled={disabled}>Export CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataFreshnessLabel({ value, className }) {
  if (!value) return null;
  return (
    <p className={className || 'text-xs text-muted-foreground'} aria-live="polite">
      Data as of {value}
    </p>
  );
}

export default ExportMenu;
