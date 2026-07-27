import React, { useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/**
 * Lightweight enterprise data grid (sort / search / pagination).
 * Kept generic for reuse across Performance tabs.
 */
export function AnalyticsDataGrid({
  rows = [],
  columns = [],
  searchPlaceholder = 'Search...',
  searchKeys = [],
  pageSize = 25,
  onRowClick,
  stickyHeader = true,
  emptyMessage = 'No rows to display.',
  className,
}) {
  const searchInputId = useId();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = rows;
    if (q && searchKeys.length) {
      next = rows.filter((row) =>
        searchKeys.some((key) => String(row[key] ?? '').toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      next = [...next].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return next;
  }, [rows, search, searchKeys, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const hasClickableRows = typeof onRowClick === 'function';

  const getSortState = (col) => {
    const key = col.sortAccessor || col.accessor;
    if (col.sortable === false || sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  return (
    <div className={cn('space-y-3', className)} role="region" aria-label="Analytics data grid">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <label className="sr-only" htmlFor={searchInputId}>{searchPlaceholder}</label>
        <Input
          id={searchInputId}
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          className="h-9 w-full sm:max-w-xs"
          aria-describedby={`${searchInputId}-count`}
        />
        <p id={`${searchInputId}-count`} className="text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} row{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="rounded-lg border border-border/60 overflow-auto max-h-[480px]">
        <Table aria-rowcount={filtered.length}>
          <TableHeader className={cn(stickyHeader && 'sticky top-0 z-10 bg-background')}>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.id || col.accessor}
                  className={cn('whitespace-nowrap', col.className)}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  aria-sort={getSortState(col)}
                >
                  {col.sortable === false ? (
                    col.header
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => toggleSort(col.sortAccessor || col.accessor)}
                      aria-label={`Sort by ${col.header}, currently ${getSortState(col)}`}
                    >
                      {col.header}
                      {sortKey === (col.sortAccessor || col.accessor) ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-10">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, idx) => (
                <TableRow
                  key={row.id || row.category || idx}
                  tabIndex={hasClickableRows ? 0 : undefined}
                  role={hasClickableRows ? 'button' : undefined}
                  aria-label={hasClickableRows ? `Open details for row ${page * pageSize + idx + 1}` : undefined}
                  className={cn(hasClickableRows && 'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2')}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(event) => {
                    if (!hasClickableRows) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                >
                  {columns.map((col) => (
                    <TableCell key={col.id || col.accessor} className={cn('whitespace-nowrap', col.cellClassName)}>
                      {col.cell ? col.cell(row) : row[col.accessor]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 0}
          onClick={() => setPage((p) => p - 1)}
          aria-label="Go to previous table page"
        >
          Previous
        </Button>
        <span className="text-center text-xs text-muted-foreground" aria-live="polite">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
          aria-label="Go to next table page"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default AnalyticsDataGrid;
