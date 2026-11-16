import type { ReactNode } from "react";
import { Diamond, History, Search } from "lucide-react";
import { cn } from "cn";
import { SECTION_TITLE, TEXT } from "../lib/text";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "./ui/command";
import type { RecentAirport } from "../lib/preferences";
import type { AirportSearchRow } from "../lib/useAirportSearch";
import { USE_WORDS, type FieldUse } from "../lib/airportIndex";
import StatusBadge from "./StatusBadge";

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

/** A group's heading as every section's title is (SectionTitle's
 *  SECTION_TITLE, 20 points, its words as written): no small grey capitals
 *  over a section (docs/design/rules.md 1.8; the web audit's WEB-8). */
export function PickerGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandGroup heading={heading} className="p-0" headingClassName={HEADING}>
      {children}
    </CommandGroup>
  );
}

const HEADING = cn("px-1 pt-0 pb-1.5", SECTION_TITLE);

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
              airport={{ ident: r.ident, name: r.name, municipality: r.municipality, closed: r.closed, use: r.use }}
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
  airport: ShownAirport;
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
      <AirportRowFace airport={airport} waypoint={waypoint} recent={recent} />
    </CommandItem>
  );
}

/** An airport as a row shows it: with, where NASR lists it as closed, the
 *  engine's label ("Closed indefinitely"), said before its town so a pilot
 *  never takes it for an open field (decision 0043); and who may use it
 *  where it is not a public field (the search's `use`). */
export type ShownAirport = RecentAirport & { closed?: string | null; use?: FieldUse | null };

/** What an airport's row shows, whatever list it is in (AirportRow here,
 *  the route box's suggestions): the icon and the two lines. Its magenta
 *  is fill and stroke, not the text colour: a row's highlight recolours
 *  its icons' text, and the diamond went black. */
export function AirportRowFace({
  airport,
  recent = false,
  waypoint = false,
}: {
  airport: ShownAirport;
  recent?: boolean;
  waypoint?: boolean;
}) {
  return (
    <>
      {waypoint ? (
        <Diamond aria-hidden="true" className="size-5 shrink-0 fill-(--airspace-magenta-text) stroke-(color:--airspace-magenta-text)" />
      ) : recent ? (
        <History aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      ) : (
        <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", TEXT.row)}>
          <span className="font-mono font-bold">{airport.ident}</span> · {airport.name}
        </span>
        {(airport.closed || airport.use || airport.municipality) && (
          <span className={cn("block truncate text-muted-foreground", TEXT.detail)}>
            <AirportDetail closed={airport.closed} use={airport.use} municipality={airport.municipality} />
          </span>
        )}
      </span>
    </>
  );
}

/** An airport's grey line: where NASR lists it as closed, the engine's
 *  label first as a Closed badge; then, where it is not a public field,
 *  who may use it as a badge (Private, Military, Joint use: NASR's use and
 *  owner, as the planner's search sends them), so a private strip is never
 *  taken for a public one; then its town. The badges are the statuses a
 *  pilot scans a list for (docs/design/rules.md 9; decision 0043). */
export function AirportDetail({
  closed,
  use,
  municipality,
}: {
  closed?: string | null;
  use?: FieldUse | null;
  municipality?: string | null;
}) {
  return (
    <>
      {closed && (
        <>
          <StatusBadge variant="closed" data-testid="airport-closed">
            {closed}
          </StatusBadge>{" "}
        </>
      )}
      {use && (
        <>
          <StatusBadge variant={use} data-testid="airport-use">
            {USE_WORDS[use]}
          </StatusBadge>{" "}
        </>
      )}
      {municipality}
    </>
  );
}
