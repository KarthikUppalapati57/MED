import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowRightLeft, Building2, Calendar, CheckCircle2, Clock, Download, PackageCheck, Search, Send } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useRequireLocation } from '@/hooks/useRequireLocation';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from '@/lib/utils';

function getLocationName(locations, id, fallback = 'Location') {
  return locations.find((item) => item.id === id)?.name || fallback;
}

function getItemValue(item, quantity) {
  const unitCost = Number(item.unit_cost || item.last_cost || 0);
  return Number(quantity || 0) * unitCost;
}

function formatDateInput(date) {
  return date.toISOString().split('T')[0];
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function csvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export default function InventoryTransfers({ inventory = [], organization }) {
  const { userProfile, location, brand } = useAuth();
  const { hasLocation, warnIfMissing } = useRequireLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const defaultSourceLocationId = location?.id || userProfile?.location_id || '';
  const defaultSourceLocationName = location?.name || userProfile?.location_name || 'Main Dominos';
  const [sourceLocationId, setSourceLocationId] = useState(defaultSourceLocationId);
  const [destination, setDestination] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyLocationFilter, setHistoryLocationFilter] = useState('all');
  const [historyDirectionFilter, setHistoryDirectionFilter] = useState('all');
  const [historyStartDate, setHistoryStartDate] = useState(() => formatDateInput(addMonths(new Date(), -1)));
  const [historyEndDate, setHistoryEndDate] = useState(() => formatDateInput(new Date()));
  const [historyDatePreset, setHistoryDatePreset] = useState('last_30_days');
  const [rangeWarningOpen, setRangeWarningOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [appliedHistoryFilters, setAppliedHistoryFilters] = useState(() => ({
    location: 'all',
    direction: 'all',
    startDate: formatDateInput(addMonths(new Date(), -1)),
    endDate: formatDateInput(new Date()),
  }));

  const { data: locations = [] } = useAuthQuery({
    queryKey: ['locations', organization?.id],
    queryFn: () => api.entities.Location.list(),
    enabled: !!organization?.id,
  });

  const { data: transfers = [] } = useAuthQuery({
    queryKey: ['transfers', organization?.id],
    queryFn: () => api.entities.Transfer.list('-created_at'),
    enabled: !!organization?.id,
  });

  // Keep "From" tracking the active location context on every switch, but only
  // while the field is still following the default -- a manual pick (via the
  // From selector below) is a deliberate override and must survive a later
  // context switch, not get silently clobbered by it.
  const prevDefaultSourceLocationId = useRef(defaultSourceLocationId);
  useEffect(() => {
    setSourceLocationId((current) => {
      if (!current || current === prevDefaultSourceLocationId.current) {
        return defaultSourceLocationId;
      }
      return current;
    });
    prevDefaultSourceLocationId.current = defaultSourceLocationId;
  }, [defaultSourceLocationId]);

  const allLocations = useMemo(() => {
    const realLocations = Array.isArray(locations) ? locations : [];
    const currentLocationOption = defaultSourceLocationId ? {
      id: defaultSourceLocationId,
      name: defaultSourceLocationName,
      organization_id: organization?.id || null,
      brand_id: brand?.brand_id || brand?.id || location?.brand_id || null,
    } : null;
    const seen = new Set(realLocations.map((item) => item.id));
    return [
      ...(currentLocationOption && !seen.has(currentLocationOption.id) ? [currentLocationOption] : []),
      ...realLocations,
    ];
  }, [brand?.brand_id, brand?.id, defaultSourceLocationId, defaultSourceLocationName, location?.brand_id, locations, organization?.id]);

  const transferLocationOptions = useMemo(() => {
    return allLocations
      .filter((item) => {
        if (item.organization_id && item.organization_id !== organization?.id) return false;
        const currentBrandId = brand?.brand_id || brand?.id || location?.brand_id;
        if (currentBrandId && item.brand_id && item.brand_id !== currentBrandId) return false;
        return true;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [allLocations, brand?.brand_id, brand?.id, location?.brand_id, organization?.id]);

  const sourceLocationName = getLocationName(transferLocationOptions, sourceLocationId, defaultSourceLocationName);

  const destinationLocations = useMemo(() => {
    return transferLocationOptions.filter((item) => item.id !== sourceLocationId);
  }, [sourceLocationId, transferLocationOptions]);

  const historyLocationOptions = useMemo(() => {
    return transferLocationOptions;
  }, [transferLocationOptions]);

  const transferHistory = useMemo(() => {
    return transfers
      .filter((transfer) => transfer.organization_id === organization?.id && !transfer.deleted_at)
      .map((transfer) => {
        const items = Array.isArray(transfer.items) ? transfer.items : [];
        return {
          ...transfer,
          items,
          total_value: items.reduce((sum, item) => sum + Number(item.value || (Number(item.quantity || 0) * Number(item.unit_cost || 0)) || 0), 0),
          source_location_id: transfer.from_location_id || transfer.source_location_id,
          destination_location_id: transfer.to_location_id || transfer.destination_location_id,
          source_location_name: getLocationName(transferLocationOptions, transfer.from_location_id || transfer.source_location_id, 'From Location'),
          destination_location_name: getLocationName(transferLocationOptions, transfer.to_location_id || transfer.destination_location_id, 'To Location'),
          status: transfer.status || 'completed',
        };
      });
  }, [organization?.id, transferLocationOptions, transfers]);

  const relevantTransfers = useMemo(() => {
    return transferHistory.filter((transfer) => (
      transfer.source_location_id === sourceLocationId || transfer.destination_location_id === sourceLocationId
    ));
  }, [sourceLocationId, transferHistory]);

  const filteredRelevantTransfers = useMemo(() => {
    const startDate = parseLocalDate(appliedHistoryFilters.startDate);
    const endDate = parseLocalDate(appliedHistoryFilters.endDate);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    return relevantTransfers.filter((transfer) => {
      const transferDate = new Date(transfer.created_at);
      const direction = transfer.source_location_id === sourceLocationId ? 'outbound' : 'inbound';
      const matchesDate = (!startDate || transferDate >= startDate) && (!endDate || transferDate <= endDate);
      const matchesDirection = appliedHistoryFilters.direction === 'all' || appliedHistoryFilters.direction === direction;
      const matchesLocation = appliedHistoryFilters.location === 'all'
        || transfer.source_location_id === appliedHistoryFilters.location
        || transfer.destination_location_id === appliedHistoryFilters.location;
      return matchesDate && matchesDirection && matchesLocation;
    });
  }, [appliedHistoryFilters, relevantTransfers, sourceLocationId]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredRelevantTransfers.length / historyPageSize));
  const paginatedRelevantTransfers = useMemo(() => {
    const safePage = Math.min(historyPage, historyTotalPages);
    const start = (safePage - 1) * historyPageSize;
    return filteredRelevantTransfers.slice(start, start + historyPageSize);
  }, [filteredRelevantTransfers, historyPage, historyPageSize, historyTotalPages]);
  const historyRangeStart = filteredRelevantTransfers.length === 0 ? 0 : ((Math.min(historyPage, historyTotalPages) - 1) * historyPageSize) + 1;
  const historyRangeEnd = Math.min(filteredRelevantTransfers.length, Math.min(historyPage, historyTotalPages) * historyPageSize);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const availableInventory = useMemo(() => {
    return inventory.map((item) => ({
      ...item,
      available_quantity: Math.max(0, Number(item.current_quantity || 0)),
    }));
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return availableInventory.filter((item) => {
      const matchesSearch = !query || String(item.product_name || '').toLowerCase().includes(query);
      return matchesSearch && Number(item.available_quantity || 0) > 0;
    });
  }, [availableInventory, search]);

  const transferTotalValue = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + getItemValue(item, item.transfer_quantity), 0);
  }, [selectedItems]);

  const handleAddItem = (item) => {
    if (selectedItems.some((selected) => selected.id === item.id)) return;
    setSelectedItems((prev) => [...prev, { ...item, transfer_quantity: Math.min(1, Number(item.available_quantity || 0)) }]);
  };

  const handleRemoveItem = (id) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateTransferQty = (id, value) => {
    setSelectedItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const maxQty = Number(item.available_quantity || 0);
      const nextQty = Math.min(Math.max(0, Number(value) || 0), maxQty);
      return { ...item, transfer_quantity: nextQty };
    }));
  };

  const openReview = () => {
    if (!sourceLocationId) {
      toast.error('Select a source location before creating a transfer.');
      return;
    }
    if (!destination) {
      toast.error('Please select a destination location.');
      return;
    }
    if (sourceLocationId === destination) {
      toast.error('From and To locations must be different.');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Please add items to transfer.');
      return;
    }
    if (selectedItems.some((item) => Number(item.transfer_quantity || 0) <= 0)) {
      toast.error('Transfer quantities must be greater than zero.');
      return;
    }
    setReviewOpen(true);
  };

  const handleStartDateChange = (value) => {
    setHistoryStartDate(value);
  };

  const handleEndDateChange = (value) => {
    setHistoryEndDate(value);
  };

  const handleHistoryDatePresetChange = (value) => {
    setHistoryDatePreset(value);
    if (value === 'custom') return;

    const today = new Date();
    const ranges = {
      last_7_days: {
        startDate: formatDateInput(addDays(today, -6)),
        endDate: formatDateInput(today),
      },
      last_30_days: {
        startDate: formatDateInput(addDays(today, -29)),
        endDate: formatDateInput(today),
      },
      this_month: {
        startDate: formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
        endDate: formatDateInput(today),
      },
      last_3_months: {
        startDate: formatDateInput(addMonths(today, -3)),
        endDate: formatDateInput(today),
      },
    };
    const range = ranges[value];
    if (!range) return;
    setHistoryStartDate(range.startDate);
    setHistoryEndDate(range.endDate);
  };

  const applyHistoryFilters = () => {
    const startDate = parseLocalDate(historyStartDate);
    const endDate = parseLocalDate(historyEndDate);
    if (startDate && endDate && endDate > addMonths(startDate, 3)) {
      setRangeWarningOpen(true);
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date cannot be before the start date.');
      return;
    }
    setAppliedHistoryFilters({
      location: historyLocationFilter,
      direction: historyDirectionFilter,
      startDate: historyStartDate,
      endDate: historyEndDate,
    });
    setHistoryPage(1);
    toast.success('Transfer history filters applied');
  };

  const transferMutation = useMutation({
    mutationFn: () => api.metrics.executeInternalTransfer(
      organization?.id,
      sourceLocationId,
      destination,
      selectedItems.map((item) => ({
        inventory_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.transfer_quantity || 0),
        unit: item.current_unit || 'ea',
        unit_cost: Number(item.unit_cost || item.last_cost || 0),
        value: getItemValue(item, item.transfer_quantity),
      })),
      userProfile?.id
    ),
    onSuccess: () => {
      const destinationName = getLocationName(allLocations, destination, 'Destination');
      setSelectedItems([]);
      setDestination('');
      setReviewOpen(false);
      queryClient.invalidateQueries({ queryKey: ['transfers', organization?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', organization?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventoryMetrics', organization?.id] });
      toast.success(`Transfer completed to ${destinationName}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to complete transfer');
    },
  });

  const dispatchLocalTransfer = () => {
    if (!warnIfMissing()) return;
    transferMutation.mutate();
  };

  const exportTransferHistory = () => {
    if (filteredRelevantTransfers.length === 0) {
      toast.error('No transfer history to export for the selected filters.');
      return;
    }

    const rows = filteredRelevantTransfers.flatMap((transfer) => {
      const direction = transfer.source_location_id === sourceLocationId ? 'Outbound' : 'Inbound';
      return (transfer.items || []).map((item) => [
        new Date(transfer.created_at).toLocaleString(),
        direction,
        transfer.source_location_name,
        transfer.destination_location_name,
        transfer.status,
        item.product_name,
        item.quantity,
        item.unit,
        Number(item.unit_cost || 0).toFixed(2),
        Number(item.value || 0).toFixed(2),
        Number(transfer.total_value || 0).toFixed(2),
      ]);
    });

    const header = ['Date', 'Direction', 'From', 'To', 'Status', 'Item', 'Quantity', 'Unit', 'Unit Cost', 'Item Value', 'Transfer Value'];
    const csv = [header, ...rows].map((row) => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transfer-history-${appliedHistoryFilters.startDate}-to-${appliedHistoryFilters.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Transfer history exported');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="border-0 border-t-4 border-t-indigo-600 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                New Location Transfer
              </CardTitle>
              <CardDescription>
                Move inventory between this client&apos;s saved locations and keep a transfer history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 rounded-md border bg-secondary/40 p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    From
                  </p>
                  <Select
                    value={sourceLocationId}
                    onValueChange={(value) => {
                      setSourceLocationId(value);
                      setSelectedItems([]);
                      if (value === destination) setDestination('');
                    }}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select source location" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferLocationOptions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    To
                  </p>
                  <Select value={destination} onValueChange={setDestination}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select destination location" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationLocations.length === 0 ? (
                        <SelectItem value="no-destination" disabled>No other locations found</SelectItem>
                      ) : (
                        destinationLocations.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Add locations in Supabase for each restaurant/store that can send or receive inventory.</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border bg-background">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-[130px]">Available</TableHead>
                      <TableHead className="w-[160px]">Transfer Qty</TableHead>
                      <TableHead className="w-[120px] text-right">Value</TableHead>
                      <TableHead className="w-[90px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                          <PackageCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                          Add items from available inventory to build a transfer.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <p className="font-medium">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">{item.location || 'Inventory item'}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {item.available_quantity} {item.current_unit || 'ea'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={item.available_quantity}
                                value={item.transfer_quantity}
                                onChange={(event) => handleUpdateTransferQty(item.id, event.target.value)}
                                className="w-24 font-mono text-sm"
                              />
                              <span className="text-xs text-muted-foreground">{item.current_unit || 'ea'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${getItemValue(item, item.transfer_quantity).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="text-resend-red hover:bg-resend-red/10" onClick={() => handleRemoveItem(item.id)}>
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Transfer value: <span className="font-semibold text-foreground">${transferTotalValue.toFixed(2)}</span>
                </div>
                <Button
                  onClick={openReview}
                  disabled={selectedItems.length === 0 || !destination || destination === 'no-destination'}
                  className="bg-indigo-600 px-8 text-white hover:bg-indigo-700"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Review Transfer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full border-0 shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base font-semibold">Available Inventory</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                className="border-none bg-secondary pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[640px] overflow-auto p-0">
            <div className="divide-y">
              {filteredInventory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No in-stock items found for this location.
                </div>
              ) : (
                filteredInventory.map((item) => {
                  const isAdded = selectedItems.some((selected) => selected.id === item.id);
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/50 ${isAdded ? 'opacity-50' : ''}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {item.available_quantity} {item.current_unit || 'ea'}
                        </p>
                      </div>
                      <Button
                        variant={isAdded ? "secondary" : "outline"}
                        size="sm"
                        disabled={isAdded}
                        onClick={() => handleAddItem(item)}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Transfer History
            </CardTitle>
            <CardDescription>Local transfer records for this location.</CardDescription>
          </div>
          <div className="flex items-end gap-3 overflow-x-auto rounded-md border bg-secondary/30 p-3">
            <div className="min-w-[190px] space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Range</p>
              <Select value={historyDatePreset} onValueChange={handleHistoryDatePresetChange}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px] space-y-1">
              <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Start
              </p>
              <Input
                type="date"
                value={historyStartDate}
                disabled={historyDatePreset !== 'custom'}
                onChange={(event) => handleStartDateChange(event.target.value)}
              />
            </div>
            <div className="min-w-[160px] space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">End</p>
              <Input
                type="date"
                value={historyEndDate}
                min={historyStartDate}
                disabled={historyDatePreset !== 'custom'}
                onChange={(event) => handleEndDateChange(event.target.value)}
              />
            </div>
            <div className="min-w-[220px] space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Location</p>
              <Select value={historyLocationFilter} onValueChange={setHistoryLocationFilter}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {historyLocationOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[170px] space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Direction</p>
              <Select value={historyDirectionFilter} onValueChange={setHistoryDirectionFilter}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All transfers</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" className="min-w-[120px] bg-primary hover:bg-primary" onClick={applyHistoryFilters}>
              Apply
            </Button>
            <Button type="button" variant="outline" className="min-w-[120px]" onClick={exportTransferHistory} disabled={filteredRelevantTransfers.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRelevantTransfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    No transfers found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRelevantTransfers.map((transfer) => {
                  const direction = transfer.source_location_id === sourceLocationId ? 'Outbound' : 'Inbound';
                  return (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(transfer.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{transfer.source_location_name} {'->'} {transfer.destination_location_name}</p>
                        <p className="text-xs text-muted-foreground">{direction}</p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {transfer.items?.slice(0, 3).map((item) => (
                            <p key={`${transfer.id}-${item.inventory_id}`} className="text-sm">
                              {item.product_name} · {item.quantity} {item.unit}
                            </p>
                          ))}
                          {(transfer.items?.length || 0) > 3 ? (
                            <p className="text-xs text-muted-foreground">+{transfer.items.length - 3} more</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">${Number(transfer.total_value || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {transfer.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">Audit</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(historyPageSize)}
                onValueChange={(value) => {
                  setHistoryPageSize(Number(value));
                  setHistoryPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[92px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-muted-foreground">
                Showing {historyRangeStart}-{historyRangeEnd} of {filteredRelevantTransfers.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <span className="min-w-20 text-center text-sm font-medium">
                  Page {Math.min(historyPage, historyTotalPages)} of {historyTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= historyTotalPages}
                  onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-secondary/40 p-3 text-sm">
              <span className="font-semibold">{sourceLocationName}</span>
              <span className="mx-2 text-muted-foreground">to</span>
              <span className="font-semibold">{getLocationName(allLocations, destination, 'Destination')}</span>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell className="text-right">{item.transfer_quantity} {item.current_unit || 'ea'}</TableCell>
                      <TableCell className="text-right">${getItemValue(item, item.transfer_quantity).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-right text-sm">
              Total transfer value: <span className="font-semibold">${transferTotalValue.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button className={cn("bg-indigo-600 text-white hover:bg-indigo-700", !hasLocation && "opacity-50 cursor-not-allowed")} onClick={dispatchLocalTransfer} disabled={transferMutation.isPending}>
              {transferMutation.isPending ? 'Completing...' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rangeWarningOpen} onOpenChange={setRangeWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose a shorter range</AlertDialogTitle>
            <AlertDialogDescription>
              Transfer history is limited to 3 months at a time so the list stays fast and easy to review. Please pick an end date within 3 months of the start date, then apply the filters again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
