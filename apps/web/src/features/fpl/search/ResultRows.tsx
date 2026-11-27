import type { MouseEvent, ReactNode } from "react";
import { cn } from "cn";
import { ChartMark, KeptChartMark } from "../../../components/ChartMark";
import { Button } from "../../../components/ui/button";
import { CommandGroup, CommandItem, CommandSeparator } from "../../../components/ui/command";
import { TEXT } from "../../../lib/text";

/**
 * The rows of the one search's results as Apple Maps on the web sets them
 * (the owner's screenshot of a search typed, 2026-11-10): one white group,
 * each row a round icon of its kind, a bold title and a grey line under it,
 * and a hairline between rows from the title's edge, not the icon's. Each
 * row is still Base UI Autocomplete's item, so the field's arrows and Enter
 * walk them as before.
 */

/** A row's round icon: a field's chart symbol, or a glyph on a disc (grey
 *  for a suggestion, the tint for an airplane). */
export function RoundIcon({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "tint" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-(--size-search-disc) shrink-0 place-items-center rounded-full [&_svg]:size-4.5",
        tone === "tint" ? "bg-tint text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** A field's chart symbol in a row: its own, weather and airspace, for the
 *  top hit (the query its card asks first anyway); the plain symbol for the
 *  rest, so a list typed into asks the planner nothing more. */
export function AirportIcon({ ident, name, kept = false }: { ident: string; name: string; kept?: boolean }) {
  return kept ? <KeptChartMark airport={{ ident, name }} size="row" /> : <ChartMark space={null} category={null} use={null} size="row" />;
}

/** The group a set of rows is in: its name for a screen reader only, as
 *  Apple's results carry no headings; the row's icon says its kind.
 *  `lined`: the hairline over it, from the title's edge as RowLine's, drawn
 *  by the group itself: a separator between two groups is a child of the
 *  list, whose children may be only groups and options (axe's
 *  aria-required-children on the one search typed, WCAG 1.3.1). */
export function ResultGroup({
  heading,
  children,
  className,
  lined = false,
}: {
  heading: string;
  children: ReactNode;
  className?: string;
  lined?: boolean;
}) {
  return (
    <CommandGroup
      heading={heading}
      className={cn(
        "p-0",
        lined && "relative pt-px before:absolute before:inset-x-0 before:top-0 before:ml-15 before:h-px before:bg-border/70",
        className,
      )}
      headingClassName="sr-only"
    >
      {children}
    </CommandGroup>
  );
}

/** The hairline between two rows of a group, from the title's edge. */
export function RowLine() {
  return <CommandSeparator className="mx-0 ml-15 bg-border/70" />;
}

/** A row's icon column: the chart's mark for a field, a disc for the rest,
 *  so its quick actions line up under its title (ResultRow). */
const ICON_WIDTH = { mark: "[--row-icon:var(--size-chart-mark)]", disc: "[--row-icon:var(--size-search-disc)]" } as const;

/** One result: its icon, its title in bold and the grey line under it,
 *  what is beside them at the right, and (the top hit) its quick actions
 *  under them. 52 at the least, as a result's two lines are in Maps. */
export function ResultRow({
  value,
  icon,
  title,
  detail,
  onSelect,
  testId,
  className,
  end,
  actions,
  tint = false,
  disabled = false,
  iconWidth = "disc",
}: {
  value: string;
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  onSelect: () => void;
  testId: string;
  className?: string;
  end?: ReactNode;
  actions?: ReactNode;
  /** The title in the tint: a row that does something. */
  tint?: boolean;
  /** Greyed, a tap and Enter doing nothing: a field a pick refuses, its
   *  reason in `detail` (the owner, 2026-11-21). */
  disabled?: boolean;
  /** The icon's width, for the actions under the title: the chart's mark
   *  (AirportIcon) or a disc (RoundIcon). */
  iconWidth?: keyof typeof ICON_WIDTH;
}) {
  const item = (
    <CommandItem
      value={value}
      disabled={disabled}
      onClick={onSelect}
      // With actions, none of its own room under the words: theirs is under
      // it (ResultRow's actions).
      className={cn("min-h-13 items-start gap-3 rounded-none px-3 py-2.5", ICON_WIDTH[iconWidth], actions && "pb-0", className)}
      data-testid={testId}
    >
      <span className="w-(--row-icon) shrink-0 pt-0.5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("block truncate font-semibold", tint ? "text-tint" : "text-foreground", TEXT.row)}>{title}</span>
        {detail && <span className={cn("block truncate text-muted-foreground", TEXT.detail)}>{detail}</span>}
      </span>
      {end}
    </CommandItem>
  );
  if (!actions) return item;
  // The actions beside the option, not in it, under its title as they were
  // (6 over them, 10 under): buttons inside an option, whose children are
  // presentational, were axe's nested-interactive on the top hit. Under the
  // option, not laid over it, so its 44-point square is its own and their
  // areas (index.css's, 6 over a small button) start where it ends. The
  // whole row greyed with the option highlighted. Side by side, each half
  // the row, never on two lines: at 19.65 px Fly Here and Depart From
  // wrapped.
  return (
    <div className={cn("has-data-highlighted:bg-muted", ICON_WIDTH[iconWidth])} data-result-row="">
      {item}
      <span className="flex gap-2 pt-1.5 pr-3 pb-2.5 pl-[calc(var(--row-icon)+1.5rem)]">{actions}</span>
    </div>
  );
}

/** A quick action in the top hit, the stock secondary button with the
 *  tint's words (CLAUDE.md: tappable things are the tint), as Apple's
 *  Directions in a result: a pointer's shortcut to what the card's own
 *  button does; its 44-point hit area index.css's pseudo-element. Out of the tab order -- the field keeps the keyboard,
 *  and Enter opens the card with the same action -- and its tap is its own,
 *  not the row's too. */
export function QuickAction({
  label,
  onClick,
  testId,
  wide = false,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
  wide?: boolean;
}) {
  const tap = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onClick();
  };
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      tabIndex={-1}
      onClick={tap}
      onPointerDown={(event) => event.stopPropagation()}
      // Each an equal share of the row, the only one all of it, as Apple's
      // lone Directions is.
      className={cn("min-w-0 flex-1 text-tint", wide && "w-full")}
      data-testid={testId}
    >
      {label}
    </Button>
  );
}

/** A title with the part typed in bold and the rest in the regular
 *  weight, as Apple Maps sets its suggestions ("**Life** Time" for
 *  "life", the owner's screenshot, 2026-11-10): the first place it is
 *  found, ignoring case. */
export function Matched({ text, typed }: { text: string; typed: string }) {
  const at = typed ? text.toLowerCase().indexOf(typed.toLowerCase()) : -1;
  if (at < 0) return <span className="font-normal">{text}</span>;
  return (
    <span className="font-normal">
      {text.slice(0, at)}
      <span className="font-semibold">{text.slice(at, at + typed.length)}</span>
      {text.slice(at + typed.length)}
    </span>
  );
}
