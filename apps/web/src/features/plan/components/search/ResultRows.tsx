import type { MouseEvent, ReactNode } from "react";
import { cn } from "cn";
import { ChartMark, KeptChartMark } from "../../../../components/Favorites";
import { Button } from "../../../../components/ui/button";
import { CommandGroup, CommandItem, CommandSeparator } from "../../../../components/ui/command";
import { TEXT } from "../../../../lib/text";

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
        "grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-4.5",
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
  return kept ? <KeptChartMark airport={{ ident, name }} size={30} /> : <ChartMark space={null} category={null} use={null} size={30} />;
}

/** The group a set of rows is in: its name for a screen reader only, as
 *  Apple's results carry no headings; the row's icon says its kind. */
export function ResultGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandGroup heading={heading} className="p-0" headingClassName="sr-only">
      {children}
    </CommandGroup>
  );
}

/** The hairline between two rows, from the title's edge. */
export function RowLine() {
  return <CommandSeparator className="mx-0 ml-15 bg-border/70" />;
}

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
}) {
  return (
    <CommandItem
      value={value}
      onClick={onSelect}
      className={cn("min-h-13 items-start gap-3 rounded-none px-3 py-2.5", className)}
      data-testid={testId}
    >
      <span className="pt-0.5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("block truncate font-semibold", tint ? "text-tint" : "text-foreground", TEXT.row)}>{title}</span>
        {detail && <span className={cn("block truncate text-muted-foreground", TEXT.detail)}>{detail}</span>}
        {actions && <span className="flex flex-wrap gap-2 pt-1.5">{actions}</span>}
      </span>
      {end}
    </CommandItem>
  );
}

/** A quick action in the top hit, a grey pill with the tint's words, as
 *  Apple's Directions in a result: a pointer's shortcut to what the card's
 *  own button does. Out of the tab order -- the field keeps the keyboard,
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
  testId: string;
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
      // The only one, the row's width, as Apple's lone Directions is.
      className={cn("relative h-8 rounded-full px-3.5 font-semibold text-tint after:absolute after:-inset-1.5", wide && "w-full")}
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
