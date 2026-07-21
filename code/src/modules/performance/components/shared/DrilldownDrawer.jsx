import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

export function DrilldownDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = 'sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto',
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={className}>
        <SheetHeader className="mb-4">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export default DrilldownDrawer;
