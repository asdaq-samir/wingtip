import { Button as BaseButton } from "@base-ui/react/button";
import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, CircleMinus } from "lucide-react";
import { cn } from "cn";
import { type ColumnDef, flexRender, tableFeatures, useTable } from "@tanstack/react-table";
import IconButton from "../../../components/IconButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import type { LogbookEntry } from "../../../lib/api/types";
import { said } from "../../../lib/endorsements";
import { GROUP_HEADING, TEXT } from "../../../lib/text";
import EntryForm from "./EntryForm";
import { requestOf } from "./logbookEntry";
import { NEWEST_FIRST, nextSort, sortEntries, type LogbookColumn, type LogbookSort } from "./logbookSort";
import type { LogbookFlightsModel } from "./useLogbookFlights";

// The core model only: the sort is the page's own (logbookSort), so its
// order is tested apart from the table and the rows stay the gateway's.
const features = tableFeatures({});

/** Each column: its header, its sort, its figures right-aligned. */
const COLUMNS: { id: LogbookColumn; header: string; figure?: boolean }[] = [
  { id: "date", header: "Date" },
  { id: "route", header: "Route" },
  { id: "airplane", header: "Airplane" },
  { id: "total", header: "Total", figure: true },
  { id: "landings", header: "Landings", figure: true },
  { id: "remarks", header: "Remarks" },
];

const cellOf = (e: LogbookEntry, id: LogbookColumn): string => {
  switch (id) {
    case "date":
      return said(e.flownOn);
    case "route":
      return e.route ?? "";
    case "airplane":
      // The tail, or the type where no tail was logged: the side panel is
      // 448 wide and the table must not scroll sideways (web.md §4).
      return e.aircraft || e.aircraftType || "";
    case "total":
      return e.totalHours.toFixed(1);
    case "landings":
      return String(e.dayLandings + e.nightLandings);
    case "remarks":
      return e.remarks ?? "";
  }
};

/**
 * The logbook on a desktop, as a dense table (web.md §9, ForeFlight Web's
 * logbook and shadcn's Data Table: TanStack Table over the stock Table):
 * a header that stays over the rows as they scroll, each header a button
 * that sorts by it (aria-sort on the one sorted by, the APG's table), the
 * figures in tabular numbers. A row's date opens the flight as a card in
 * the table, under its row, where its form is; Edit's minus takes one out
 * with a toast's Undo, as the phone's list does. Its own chunk: a
 * phone draws the list (LogbookFlights) and never loads this.
 */
export default function LogbookTable({ entries, vm }: { entries: LogbookEntry[]; vm: LogbookFlightsModel }) {
  const [sort, setSort] = useState<LogbookSort>(NEWEST_FIRST);
  const data = sortEntries(entries, sort);
  const columns: ColumnDef<typeof features, LogbookEntry>[] = COLUMNS.map((c) => ({
    id: c.id,
    header: () => {
      const on = sort.column === c.id;
      const Arrow = sort.order === "ascending" ? ArrowUp : ArrowDown;
      return (
        <BaseButton
          onClick={() => setSort(nextSort(sort, c.id))}
          className={cn(
            "relative inline-flex items-center gap-1 rounded-sm outline-none after:absolute after:-inset-2 focus-visible:ring-2 focus-visible:ring-ring",
            c.figure && "flex-row-reverse",
            on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`logbook-sort-${c.id}`}
        >
          {c.header}
          <Arrow className={cn("size-3.5", !on && "invisible")} aria-hidden="true" />
        </BaseButton>
      );
    },
    cell: ({ row }) => {
      const text = cellOf(row.original, c.id);
      if (c.id !== "date") return text;
      // The date opens the flight: a real button, so Tab reaches each row.
      return (
        <BaseButton
          onClick={() => (vm.changing === row.original.id ? vm.stopChanging() : vm.change(row.original.id))}
          aria-expanded={vm.changing === row.original.id}
          className="relative font-semibold text-tint outline-none after:absolute after:-inset-2 focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="logbook-entry-open"
        >
          {text}
        </BaseButton>
      );
    },
    meta: { className: cn(c.figure && "text-right tabular-nums", c.id === "remarks" && "max-w-32 truncate") },
  }));
  const table = useTable({ features, data, columns, getRowId: (e) => String(e.id) });
  const span = columns.length + (vm.editing ? 1 : 0);
  return (
    // The scroll's own padding under the sticky header, so a row focused by
    // Tab is never hidden under it (WCAG 2.4.11, web.md §4).
    <div className="max-h-[70vh] scroll-pt-11 overflow-y-auto rounded-lg border border-border" data-testid="logbook-table">
      <Table className={cn("tabular-nums", TEXT.detail)}>
        <TableHeader className="sticky top-0 z-10 bg-background/85 backdrop-blur-xl solid:bg-background dark:bg-popover/85">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {vm.editing && <TableHead className="w-10" aria-label="Delete" />}
              {group.headers.map((header) => {
                const id = header.column.id as LogbookColumn;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sort.column === id ? sort.order : undefined}
                    className={cn(GROUP_HEADING, header.column.columnDef.meta?.className)}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const e = row.original;
            const open = vm.changing === e.id;
            const refused = vm.refused?.id === e.id ? vm.refused : null;
            return (
              <Fragment key={row.id}>
                <TableRow data-testid="logbook-entry" data-state={open ? "selected" : undefined}>
                  {vm.editing && (
                    <TableCell className="w-10">
                      <IconButton
                        label={`Delete the flight of ${said(e.flownOn)}`}
                        className="text-destructive"
                        onClick={() => vm.remove(e)}
                      >
                        <CircleMinus className="size-5 fill-destructive text-white dark:text-background" />
                      </IconButton>
                    </TableCell>
                  )}
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {/* The flight as a card, under its row, its form in it. */}
                {open && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={span} className="whitespace-normal">
                      <div
                        className="mx-auto max-w-md rounded-xl border border-border bg-card p-3 shadow-sm"
                        data-testid="logbook-entry-form"
                      >
                        <EntryForm
                          initial={refused?.entry ?? requestOf(e)}
                          problem={refused?.problem}
                          saving={vm.saving}
                          onSave={(entry) => vm.update(e.id, entry)}
                          onCancel={vm.stopChanging}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
