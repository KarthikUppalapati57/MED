import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

/**
 * Shared Performance filter bar — not coupled to Category Report.
 */
export function PerformanceFilterBar({
  dateFrom,
  dateTo,
  comparisonDateFrom,
  comparisonDateTo,
  locationIds = [],
  categoryIds = [],
  vendorIds = [],
  locations = [],
  categories = [],
  vendors = [],
  autoComparison = true,
  onDateFromChange,
  onDateToChange,
  onComparisonDateFromChange,
  onComparisonDateToChange,
  onLocationChange,
  onCategoryChange,
  onVendorChange,
  onAutoComparisonChange,
  onClear,
  onDateRangeCommit,
}) {
  const handleFrom = (value) => {
    onDateFromChange?.(value);
    if (autoComparison && dateTo) onDateRangeCommit?.(value, dateTo);
  };
  const handleTo = (value) => {
    onDateToChange?.(value);
    if (autoComparison && dateFrom) onDateRangeCommit?.(dateFrom, value);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date from</Label>
          <Input type="date" value={dateFrom || ''} onChange={(e) => handleFrom(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date to</Label>
          <Input type="date" value={dateTo || ''} onChange={(e) => handleTo(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Compare from</Label>
          <Input
            type="date"
            value={comparisonDateFrom || ''}
            disabled={autoComparison}
            onChange={(e) => onComparisonDateFromChange?.(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Compare to</Label>
          <Input
            type="date"
            value={comparisonDateTo || ''}
            disabled={autoComparison}
            onChange={(e) => onComparisonDateToChange?.(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>

        <div className="space-y-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Location</Label>
          <Select
            value={locationIds[0] || 'all'}
            onValueChange={(v) => onLocationChange?.(v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={categoryIds[0] || 'all'}
            onValueChange={(v) => onCategoryChange?.(v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Vendor</Label>
          <Select
            value={vendorIds[0] || 'all'}
            onValueChange={(v) => onVendorChange?.(v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant={autoComparison ? 'secondary' : 'outline'}
          size="sm"
          className="h-9"
          onClick={() => onAutoComparisonChange?.(!autoComparison)}
        >
          {autoComparison ? 'Auto comparison' : 'Custom comparison'}
        </Button>

        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onClear}>
          <X className="w-4 h-4 mr-1" />
          Clear filters
        </Button>
      </div>

      {(locationIds.length > 0 || categoryIds.length > 0 || vendorIds.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {locationIds.map((id) => (
            <Badge key={`loc-${id}`} variant="secondary">
              Loc: {locations.find((l) => l.id === id)?.name || id}
            </Badge>
          ))}
          {categoryIds.map((id) => (
            <Badge key={`cat-${id}`} variant="secondary">
              {id}
            </Badge>
          ))}
          {vendorIds.map((id) => (
            <Badge key={`ven-${id}`} variant="secondary">
              Vendor: {vendors.find((v) => v.id === id)?.name || id}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default PerformanceFilterBar;
