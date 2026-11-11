import type { ReactNode } from "react";
import { Diamond, History, Search } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "./ui/command";
import type { RecentAirport } from "../lib/preferences";
import type { AirportSearchRow } from "../lib/useAirportSearch";

/**
 * What an airport search answers, as a list: the one list for every place
 * an airport or a waypoint is searched for -- the airport picker's sheet
 * (AirportPicker) and the route box's suggestions as its field is typed
 * in (RouteBox) -- so the two look and behave alike (the owner's "one
 * look, common code", 2026-10-27). Groups of the caller's own first (the
 * suggested waypoints, the pilot's own point, the recents), then the
 * search's airports and waypoints. Base UI's Autocomplete list, inside
 * the caller's Command, which keeps the arrows and Enter on the field
 * being typed in.
 * Dimmed while its rows answer something older than the field.
 */
export default function AirportResults({
  rows,
  answered,
  onAirport,
  onWaypoint,
  className,
  empty,
  children,
}: {
  rows: AirportSearchRow[];
  /** Whether the rows answer what is typed now. */
  answered: boolean;
  onAirport: (airport: RecentAirport) => void;
  onWaypoint: (ident: string) => void;
  className?: string;
  /** What it says where the search has nothing, shown only then, in the
   *  list's one status (CommandEmpty), which screen readers hear. */
  empty?: ReactNode;
  /** Groups before the search's (PickerGroup). */
  children?: ReactNode;
}) {
  return (
    <CommandList className={cn("max-h-none overflow-visible", !answered && "opacity-60", className)} aria-busy={!answered}>
      <CommandEmpty>{rows.length === 0 && empty}</CommandEmpty>
      {children}
      <SearchRows rows={rows} onAirport={onAirport} onWaypoint={onWaypoint} />
    </CommandList>
  );
}

/** A group's heading as a grouped list's is (GroupedList): 13, semibold,
 *  in small capitals. */
export function PickerGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandGroup heading={heading} className="p-0" headingClassName={HEADING}>
      {children}
    </CommandGroup>
  );
}

// The group's heading at GROUP_HEADING's note sizes (TEXT.note, 12 and 13).
const HEADING =
  "px-1 pt-0 pb-1.5 font-semibold uppercase tracking-wide text-muted-foreground text-xs pointer-coarse:text-(length:--type-note)";

/** The search's own rows: the airports, then a stop's waypoints -- flown
 *  through, not kept among the recent airports. */
function SearchRows({
  rows,
  onAirport,
  onWaypoint,
}: {
  rows: AirportSearchRow[];
  onAirport: (airport: RecentAirport) => void;
  onWaypoint: (ident: string) => void;
}) {
  const fields = rows.filter((r) => r.kind !== "fix");
  const waypoints = rows.filter((r) => r.kind === "fix");
  return (
    <>
      {fields.length > 0 && (
        <PickerGroup heading="Airports">
          {fields.map((r) => (
            <AirportRow
              key={r.ident}
              airport={{ ident: r.ident, name: r.name, municipality: r.municipality }}
              onSelect={() => onAirport({ ident: r.ident, name: r.name, municipality: r.municipality })}
            />
          ))}
        </PickerGroup>
      )}
      {waypoints.length > 0 && (
        <PickerGroup heading="Waypoints">
          {waypoints.map((r) => (
            <AirportRow
              key={r.ident}
              waypoint
              airport={{ ident: r.ident, name: r.name, municipality: r.region }}
              onSelect={() => onWaypoint(r.ident)}
            />
          ))}
        </PickerGroup>
      )}
    </>
  );
}

/** One airport in the list, as a row of Maps' search: its ident in bold
 *  and its name, its town under them in the grey -- or a waypoint, with
 *  the magenta diamond the map marks one with, its kind and its state. */
export function AirportRow({
  airport,
  recent = false,
  waypoint = false,
  onSelect,
  testId,
  value,
}: {
  airport: RecentAirport;
  recent?: boolean;
  waypoint?: boolean;
  onSelect: () => void;
  testId?: string;
  /** The row's value to the list, where its ident alone is not unique. */
  value?: string;
}) {
  return (
    // 52 at the least, as a search result's two lines are in Maps: the
    // row is the control, not a control grown to its hit area.
    <CommandItem
      value={value ?? airport.ident}
      onClick={onSelect}
      className="min-h-13 gap-3 rounded-lg px-2 py-2"
      data-testid={testId ?? "airport-result"}
    >
      {/* Its magenta as fill and stroke, not the text colour: a row's
          highlight recolours its icons' text, and the diamond went black. */}
      {waypoint ? (
        <Diamond className="size-5 fill-(--airspace-magenta-text) stroke-(color:--airspace-magenta-text)" />
      ) : recent ? (
        <History className="size-5 text-muted-foreground" />
      ) : (
        <Search className="size-5 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", TEXT.row)}>
          <span className="font-mono font-bold">{airport.ident}</span> · {airport.name}
        </span>
        {airport.municipality && <span className={cn("block truncate text-muted-foreground", TEXT.detail)}>{airport.municipality}</span>}
      </span>
    </CommandItem>
  );
}
