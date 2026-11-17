import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "cn";
import { flexRender, useTable, type ColumnDef } from "@tanstack/react-table";
import { NoteRow, SelectableRow } from "../../components/SelectableRows";
import { isLegPoint, legOf, rowPoint, type NavLogRow } from "../plan";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import type { Totals } from "../../lib/api/types";
import { hoverLeg } from "../../lib/map/marks/mapHover";
import { GROUP_HEADING, TEXT } from "../../lib/text";
import NavLogAge from "./NavLogAge";
import { NavLogTotals } from "./NavLogTotals";
import { columnClass, navLogTableFeatures } from "./navLogColumns";

/** The nav log as a table: the desktop's dense one and paper's. */
export function NavLogTable({
  data,
  columns,
  onDesk,
  printing,
  airplane,
  dep,
  dest,
  totals,
  flying,
  isSelected,
  noteOf,
  onSelectPoint,
  onDeselectPoint,
  setSelectedRow,
  setFlyingRow,
}: {
  data: NavLogRow[];
  columns: ColumnDef<typeof navLogTableFeatures, NavLogRow>[];
  onDesk: boolean;
  printing: boolean;
  airplane: boolean;
  dep: string;
  dest: string;
  totals: Totals | null;
  /** The row the dry run is flying to, if any. */
  flying: number | null;
  isSelected: (lat: number, lon: number) => boolean;
  noteOf: (r: NavLogRow, rowSelected: boolean) => ReactNode;
  onSelectPoint: (lat: number, lon: number) => void;
  onDeselectPoint: () => void;
  setSelectedRow: (el: HTMLElement | null) => void;
  setFlyingRow: (el: HTMLElement | null) => void;
}) {
  const metaClass = (meta?: { className?: string }) => columnClass(meta, onDesk);
  // With no airplane no tops of climb and descent, as NavLogList has it:
  // where the airplane levels off is its climb's.
  const tableRows = useMemo(() => (onDesk && !airplane ? data.filter((r) => !isLegPoint(r)) : data), [onDesk, airplane, data]);
  const table = useTable({ features: navLogTableFeatures, data: tableRows, columns, getRowId: (row) => row.key });
  // Whether the table fits the drawer's width (see navLogTable): watched,
  // since a departure time adds a column and the text size moves every
  // one of them. From a ref, not an effect: the table is there only
  // while the nav log's section is open, mounted afresh each time.
  const [fits, setFits] = useState(true);
  const watchFit = useCallback((box: HTMLDivElement | null) => {
    const table = box?.querySelector("table");
    if (!box || !table || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setFits(table.offsetWidth <= box.clientWidth + 1));
    observer.observe(box);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  // The table itself. With the briefing's sections under it, the table
  // scrolls sideways inside its own container so the sections below
  // stay put -- when it is wider than the drawer: the five columns with
  // the text set large, or in a window as narrow as Slide Over's. While it
  // fits, the container lets its overflow go, so that its headings can
  // stay at the top of the drawer as the log scrolls under them (a
  // sideways scroller holds a sticky heading to itself). Printed,
  // nothing scrolls: every column is laid out for the browser to
  // paginate.
  return (
    <div ref={watchFit} data-testid={onDesk ? "navlog-table" : undefined}>
      {onDesk && <NavLogAge />}
      <Table
        containerClassName={cn(fits ? "overflow-x-visible" : "overflow-x-auto overscroll-x-contain", "print:overflow-visible")}
        className={cn(
          // The cells' padding halved and the waypoint's name free to wrap
          // (see its column), so the five columns fit the drawer without a
          // sideways scroll -- beside a desktop's map as on a phone, where
          // every column of it scrolled sideways under the waypoint's. On
          // paper, every column at the stock padding.
          "text-right whitespace-nowrap [&_td]:px-1 [&_th]:px-1 print:[&_td]:px-2 print:[&_th]:px-2",
          // A desktop's nine or ten columns in the side panel's width with
          // no sideways scroll (web.md §4): the cells' padding halved again.
          onDesk && "[&_td]:px-0.5 [&_th]:px-0.5",
          // To a finger, the figures at what is read (15) and the rows 44
          // points to tap (lib/text.ts), as the pilot had them: 12 on a
          // phone was too small to read. (What they had asked to have
          // compact was the leg's figures under a row, LegLine.)
          TEXT.detail,
          "pointer-coarse:[&_td]:py-3",
        )}
      >
        <TableCaption className="sr-only">
          Navigation log from {dep} to {dest}
        </TableCaption>
        {/* Over the rows as they scroll, the sheet's own frosted glass
        rather than a band of white across it. */}
        <TableHeader className="sticky top-[var(--section-tabs,0px)] z-10 bg-background/75 backdrop-blur-xl solid:bg-background solid:backdrop-blur-none dark:solid:bg-popover print:static print:bg-transparent print:backdrop-blur-none dark:bg-popover/75">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                // Each heading over its own figures: right-aligned, as they
                // are (the stock heading is left-aligned, and every label
                // sat off its column), the waypoint's left as its names
                // are; set as every group's heading is in the app
                // (GROUP_HEADING), at the pilot's ask.
                <TableHead key={header.id} className={cn("text-right", GROUP_HEADING, metaClass(header.column.columnDef.meta))}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {data.length === 0 && (
            <TableRow>
              <TableCell className="text-left text-muted-foreground" colSpan={columns.length}>
                No route planned yet
              </TableCell>
            </TableRow>
          )}
          {/* One row per waypoint the plan already knows about, not
          one per leg that's actually arrived -- `leg` is
          undefined until its own line streams in, and every cell
          that depends on it shows a dash rather than waiting. The
          departure (when present) is `table`'s own first row,
          one kind of row among the three -- see rows.ts. */}
          {table.getRowModel().rows.map((row) => {
            const r = row.original;
            const { lat, lon } = rowPoint(r);
            const rowSelected = isSelected(lat, lon);
            const leg = legOf(r);
            return (
              <Fragment key={row.id}>
                {/* A leg with no nearby winds-aloft station is a
                no-wind estimate, not a calm one. Italics keep that
                visible rather than letting it read as a confident
                zero -- as for a leg that simply hasn't arrived yet,
                for the same reason: both are "no data (yet)," not a
                confident answer. They were the grey rows, before
                every row's figures were grey. */}
                <SelectableRow
                  // A mouse on a leg's row lights the leg on the map (web.md §4).
                  onHover={
                    onDesk && row.index > 0 ? (on) => hoverLeg(on ? [rowPoint(tableRows[row.index - 1]!), { lat, lon }] : null) : undefined
                  }
                  selected={rowSelected}
                  flying={row.index === flying}
                  kind={r.kind}
                  estimated={r.kind !== "departure" && !leg?.wind}
                  expands
                  // The selected row tapped again is deselected, on the
                  // map too, which closes its note.
                  onSelect={() => (rowSelected ? onDeselectPoint() : onSelectPoint(lat, lon))}
                  scrollRef={rowSelected ? setSelectedRow : row.index === flying ? setFlyingRow : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={metaClass(cell.column.columnDef.meta)} data-testid={`navlog-row-${cell.column.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </SelectableRow>
                {/* The row's own note -- the leg's figures a phone has no
                columns for, and the checkpoint's description or the
                airport's name -- under the selected row only, the way
                the training drawer's rating buttons are: every row
                open at once was three rows a waypoint, and a log of
                twenty scrolled for a screen and a half. A tap on a row
                selects it, on the map too, and opens it. On paper
                every row is open. */}
                {(rowSelected || printing) && (
                  <NoteRow selected={rowSelected} colSpan={columns.length}>
                    {noteOf(r, rowSelected)}
                  </NoteRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
        {/* The totals at the foot, a desktop's: the engine's own sums. */}
        {onDesk && totals && data.length > 0 && <NavLogTotals totals={totals} columns={columns.map((c) => c.id ?? "")} />}
      </Table>
    </div>
  );
}
