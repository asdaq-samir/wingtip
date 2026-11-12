import type { ReactNode } from "react";
import { Header, ListBox, ListBoxItem, ListBoxSection } from "react-aria-components";
import { cn } from "cn";
import { AirportRowFace } from "../../../../components/AirportResults";
import type { Detour } from "../../../../lib/api/types";
import { bearing } from "../../../../lib/format";
import { frdOf } from "../../../../lib/identSchema";
import type { RecentAirport } from "../../../../lib/preferences";
import type { AirportSearchRow } from "../../../../lib/useAirportSearch";
import { TEXT } from "../../../../lib/text";

/**
 * What answers what is typed in the route's box, under it: Fly via's ways
 * round before anything is typed, the pilot's own point off a fix, then
 * the airport search's airports and waypoints -- in the groups and rows
 * of the airport search's own list (AirportResults), on React Aria's
 * ListBox, which the box's Autocomplete drives from the field: the arrows
 * light a row and Enter takes it, the typing staying in the box. Dimmed
 * while its rows answer something older than the field.
 */
export default function RouteSuggestions({
  rows,
  answered,
  via,
  ownPoint,
  onPick,
}: {
  rows: AirportSearchRow[];
  answered: boolean;
  /** Fly via's waypoints round the Class B, before anything is typed. */
  via: Detour[];
  /** The pilot's own point off a fix ("VPBNG/090/30"), offered first. */
  ownPoint: string | null;
  onPick: (ident: string, airport?: RecentAirport) => void;
}) {
  const fields = rows.filter((r) => r.kind !== "fix");
  const waypoints = rows.filter((r) => r.kind === "fix");
  return (
    <ListBox
      // The first row lit as the rows come, as the list's was ("always"),
      // so Return takes what is seen lit: drawn afresh for each answer, a
      // row lit is the first of the rows shown.
      key={[...via.map((d) => d.ident), ownPoint, ...rows.map((r) => r.ident)].join(" ")}
      // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the Autocomplete's virtual focus: a row lit (aria-activedescendant), the focus kept in the field
      autoFocus="first"
      aria-label="Airports and waypoints"
      aria-busy={!answered}
      className={cn("outline-none", !answered && "opacity-60")}
      data-testid="route-suggestion-list"
    >
      {via.length > 0 && (
        <Group heading="Suggested">
          {via.map((d) => (
            <Row
              key={`via-${d.ident}`}
              id={`via-${d.ident}`}
              waypoint
              testId="picker-suggestion"
              airport={{ ident: d.ident, name: d.kind, municipality: [`+${Math.round(d.added_nm)} nm`, d.description].filter(Boolean).join(" · ") }}
              onAction={() => onPick(d.ident)}
            />
          ))}
        </Group>
      )}
      {ownPoint && (
        <Group heading="Your point">
          <Row id="own" waypoint testId="route-own-point" airport={{ ident: ownPoint, name: frdWords(ownPoint) }} onAction={() => onPick(ownPoint)} />
        </Group>
      )}
      {fields.length > 0 && (
        <Group heading="Airports">
          {fields.map((r) => {
            const airport = { ident: r.ident, name: r.name, municipality: r.municipality };
            return <Row key={`airport-${r.ident}`} id={`airport-${r.ident}`} airport={airport} onAction={() => onPick(r.ident, airport)} />;
          })}
        </Group>
      )}
      {waypoints.length > 0 && (
        <Group heading="Waypoints">
          {waypoints.map((r) => (
            <Row
              key={`fix-${r.ident}`}
              id={`fix-${r.ident}`}
              waypoint
              airport={{ ident: r.ident, name: r.name, municipality: r.region }}
              onAction={() => onPick(r.ident)}
            />
          ))}
        </Group>
      )}
    </ListBox>
  );
}

/** The pilot's own point as words: "30 nm on 090° from VPBNG". */
function frdWords(ident: string): string {
  const frd = frdOf(ident);
  return frd ? `${frd.distanceNm} nm on ${bearing(frd.course)} from ${frd.base}` : ident;
}

/** A group's heading as the airport search's (PickerGroup): semibold, in
 *  small capitals, at a note's size. */
function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <ListBoxSection>
      <Header className={cn("px-1 pt-0 pb-1.5 font-semibold tracking-wide text-muted-foreground uppercase", TEXT.note)}>{heading}</Header>
      {children}
    </ListBoxSection>
  );
}

/** One row, as the airport search's (AirportRow): its ident in bold and
 *  its name, its town under them in the grey -- or a waypoint, with the
 *  magenta diamond the map marks one with. 52 at the least, as a search
 *  result's two lines are in Maps: the row is the control. Lit (React
 *  Aria's virtual focus, data-focused) in the muted fill. */
function Row({
  id,
  airport,
  waypoint = false,
  onAction,
  testId = "airport-result",
}: {
  /** Its key in the list, unique across the groups. */
  id: string;
  airport: RecentAirport;
  waypoint?: boolean;
  onAction: () => void;
  testId?: string;
}) {
  return (
    <ListBoxItem
      id={id}
      textValue={airport.ident}
      onAction={onAction}
      data-testid={testId}
      className="flex min-h-13 cursor-default items-center gap-3 rounded-lg px-2 py-2 outline-hidden select-none data-focused:bg-muted data-hovered:bg-muted"
    >
      <AirportRowFace airport={airport} waypoint={waypoint} />
    </ListBoxItem>
  );
}
