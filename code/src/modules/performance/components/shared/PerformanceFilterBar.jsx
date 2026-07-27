import React, { useId } from 'react';
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
 * Shared Performance filter bar, not coupled to Category Report.
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
  locationLocked = false,
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
  showComparison = true,
  showVendor = true,
}) {
  const idPrefix = useId();
  const dateFromId = `${idPrefix}-date-from`;
  const dateToId = `${idPrefix}-date-to`;
  const comparisonFromId = `${idPrefix}-comparison-from`;
  const comparisonToId = `${idPrefix}-comparison-to`;
  const locationId = `${idPrefix}-location`;
  const categoryId = `${idPrefix}-category`;
  const vendorId = `${idPrefix}-vendor`;

  const handleFrom = (value) => {
    onDateFromChange?.(value);
    if (autoComparison && dateTo) onDateRangeCommit?.(value, dateTo);
  };
  const handleTo = (value) => {
    onDateToChange?.(value);
    if (autoComparison && dateFrom) onDateRangeCommit?.(dateFrom, value);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3" role="search" aria-label="Performance report filters">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-8 xl:items-end">
        <div className="space-y-1">
          <Label htmlFor={dateFromId} className="text-xs text-muted-foreground">Date from</Label>
          <Input id={dateFromId} type="date" value={dateFrom || ''} onChange={(e) => handleFrom(e.target.value)} className="h-9 w-full" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={dateToId} className="text-xs text-muted-foreground">Date to</Label>
          <Input id={dateToId} type="date" value={dateTo || ''} onChange={(e) => handleTo(e.target.value)} className="h-9 w-full" />
        </div>
        {showComparison ? <div className="space-y-1">
          <Label htmlFor={comparisonFromId} className="text-xs text-muted-foreground">Compare from</Label>
          <Input
            id={comparisonFromId}
            type="date"
            value={comparisonDateFrom || ''}
            disabled={autoComparison}
            onChange={(e) => onComparisonDateFromChange?.(e.target.value)}
            className="h-9 w-full"
          />
        </div> : null}
        {showComparison ? <div className="space-y-1">
          <Label htmlFor={comparisonToId} className="text-xs text-muted-foreground">Compare to</Label>
          <Input
            id={comparisonToId}
            type="date"
            value={comparisonDateTo || ''}
            disabled={autoComparison}
            onChange={(e) => onComparisonDateToChange?.(e.target.value)}
            className="h-9 w-full"
          />
        </div> : null}

        <div className="space-y-1 min-w-0">
          <Label id={locationId} className="text-xs text-muted-foreground">Location</Label>
          <Select
            value={locationIds[0] || (locationLocked ? 'none' : 'all')}
            disabled={locationLocked}
            onValueChange={(v) => {
              if (locationLocked) return;
              onLocationChange?.(v === 'all' ? [] : [v]);
            }}
          >
            <SelectTrigger className="h-9 w-full" aria-labelledby={locationId}>
              <SelectValue placeholder={locationLocked ? 'Active location required' : 'All locations'} />
            </SelectTrigger>
            <SelectContent>
              {locationLocked ? null : <SelectItem value="all">All locations</SelectItem>}
              {locationIds[0] && !locations.some((loc) => loc.id === locationIds[0]) ? (
                <SelectItem value={locationIds[0]}>Active location</SelectItem>
              ) : null}
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
              {locationLocked && !locationIds[0] ? <SelectItem value="none">No active location</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 min-w-0">
          <Label id={categoryId} className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={categoryIds[0] || 'all'}
            onValueChange={(v) => onCategoryChange?.(v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-9 w-full" aria-labelledby={categoryId}>
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

        {showVendor ? <div className="space-y-1 min-w-0">
          <Label id={vendorId} className="text-xs text-muted-foreground">Vendor</Label>
          <Select
            value={vendorIds[0] || 'all'}
            onValueChange={(v) => onVendorChange?.(v === 'all' ? [] : [v])}
          >
            <SelectTrigger className="h-9 w-full" aria-labelledby={vendorId}>
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
        </div> : null}

        <div className="flex flex-col gap-2 sm:flex-row xl:col-span-1 xl:flex-col">
          {showComparison ? <Button
            type="button"
            variant={autoComparison ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 w-full"
            aria-pressed={autoComparison}
            aria-label={autoComparison ? 'Auto comparison enabled' : 'Custom comparison enabled'}
            onClick={() => onAutoComparisonChange?.(!autoComparison)}
          >
            {autoComparison ? 'Auto comparison' : 'Custom comparison'}
          </Button> : null}

          <Button type="button" variant="ghost" size="sm" className="h-9 w-full" onClick={onClear} aria-label="Clear Performance filters">
            <X className="w-4 h-4 mr-1" aria-hidden="true" />
            Clear filters
          </Button>
        </div>
      </div>

      {(locationIds.length > 0 || categoryIds.length > 0 || vendorIds.length > 0) && (
        <div className="flex flex-wrap gap-2" aria-label="Active Performance filters">
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
