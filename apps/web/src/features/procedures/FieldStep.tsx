import { cn } from "cn";
import { CardThread } from "./routeCard";
import { FIELD_CARD, FIELD_GAP } from "./routeListStyle";
import { Collapsible, CollapsibleContent } from "../../components/ui/collapsible";
import { etaAt, type NavLogRow, type ProcedureAirport, type ProcedureKind } from "../plan";
import { sameField } from "../../lib/procedures";
import { AirportMark, PointMark, DepartPicker } from "../navlog/lazy";
import { colourOf } from "../../lib/map/marks/flightCategory";
import FixBranch from "./FixBranch";
import { toggleField } from "./fieldsOpen";
import type { ProceduresRouteModel } from "./useProceduresRoute";
import { FieldHead } from "./FieldHead";
import { KIND_WORD } from "./procedureWords";
import { pointEnd } from "./pointEnd";
import { fieldParts, kindMenu, kindPicked, windWords, type FieldPart } from "./fieldParts";
import { PartTray } from "./RunwayTray";

type Kind = ProcedureKind;

/**
 * A field's step in the route read in flight and in a dry run
 * (ProceduresRoute): what is flown there, in the order it is flown. On the
 * ground the route is FPL's timeline (TimelineRoute), its runways and
 * procedures under each line.
 */
export function FieldStep({
  vm,
  a,
  row,
  last,
  leads,
}: {
  vm: ProceduresRouteModel;
  a: ProcedureAirport;
  row: NavLogRow | undefined;
  last: boolean;
  leads: boolean;
}) {
  const { airports, cards, inRoute, procedures, crossings, depart, weather, tanks, isOpen, pointIndex, reportedOf } = vm;
  const { onProcedures, onFix, onDepart } = vm;
  const i = airports.findIndex((f) => sameField(f.ident, a.ident));
  // 22 in the 36 of its glass button, where the map's 26 filled it.
  // Before the plan, the field's own mark from its card (its airspace,
  // its weather), not a dot, at the owner's screenshot (a departure alone);
  // and before its card is in, the plain airport symbol the route's box
  // shows (the owner's screenshot, 2026-10-29: BDL to KGLH).
  const placed = cards[i]?.data;
  const mark = row ? (
    <PointMark row={row} number={undefined} weather={weather} airportSize={22} />
  ) : (
    <AirportMark
      airspaceClass={placed?.airspace_class ?? null}
      colour={weather(a.ident) ?? colourOf(placed?.metar?.flight_category ?? null)}
      size={22}
    />
  );
  // Each picked procedure the head of a branch of its fixes, in the order
  // they are flown (FixBranch), its pull-down its name; each kind not
  // picked a "+ Arrival" to pick one (option C of the procedures canvas).
  const branch = (kind: Kind) => {
    const inPlace = inRoute.find((p) => sameField(p.ident, a.ident) && p.kind === kind);
    // By its id, not its kind: the field's list, which says each pick's
    // kind, is asked for only as a pull-down opens.
    const chosen = inPlace && procedures.find((p) => sameField(p.ident, a.ident) && p.id === inPlace.id);
    if (!inPlace || !chosen) return null;
    return (
      <FixBranch
        key={`branch-${kind}`}
        name={inPlace.label}
        kind={KIND_WORD[kind]}
        menu={kindMenu(vm, a, kind, "button")}
        fixes={inPlace.fixes ?? []}
        direct={inPlace.direct ?? null}
        crossings={crossings}
        onDirect={(fix) =>
          onProcedures(
            procedures.map((p) => (p === chosen ? { ...p, direct: fix } : p)),
            null,
          )
        }
        onOpen={(fix) => onFix(a.ident, kind, fix)}
      />
    );
  };
  const partBody = (part: FieldPart) => {
    const picked = part.kinds.filter((k) => kindPicked(vm, a, k));
    const adds = part.kinds.filter((k) => !picked.includes(k)).map((k) => kindMenu(vm, a, k, "add"));
    return (
      <div className="space-y-3 pt-3">
        <PartTray vm={vm} a={a} part={part} trailing={adds} />
        {picked.map(branch)}
      </div>
    );
  };
  // One block an airport, at the owner's pick (2026-10-21, boards 4 and 5
  // of the canvas): its ident, the fuel in the tanks, its time over its
  // elevation and its menu; its wind under. Opened, a line each for its
  // landing and its takeoff, named for a screen reader as its parts are.
  const key = `${a.role}:${a.ident}`;
  const opened = isOpen(key);
  const parts = fieldParts(vm, a, row);
  const first = parts[0]!;
  // The departure's time on its own step (the owner: "The departure time
  // can move from the route box to the departure and arrival boxes").
  const time =
    a.role === "Departure" ? (
      <DepartPicker value={depart} onChange={onDepart} look="time" />
    ) : row ? (
      etaAt(depart || new Date().toISOString(), row.minutesFlown)
    ) : null;
  const end = pointEnd(vm, a.ident, {
    time,
    waypoint: false,
    elevationFt: a.elevationFt ?? placed?.elevation_ft ?? null,
    to: a.role !== "Departure",
    stop: a.role === "Stop",
    holdable: a.role === "Destination",
    row,
    index: pointIndex(a.ident, a.role),
  });
  const reported = reportedOf(a.ident);
  const wind = windWords(reported);
  const tank = row ? tanks.get(row.key) : a.role === "Departure" ? tanks.get("departure") : undefined;
  return (
    // The field a stock Collapsible, its lines the trigger: aria-expanded
    // and aria-controls Base UI's, and the landing's or the takeoff's body
    // its content. A stop's second part, in a section of its own, is shown
    // with it (a Collapsible has one content).
    <Collapsible
      key={key}
      open={opened}
      onOpenChange={(next) => toggleField(key, a.ident, next)}
      render={
        <div
          className={cn("relative isolate", FIELD_CARD, !last && FIELD_GAP)}
          data-testid="route-field"
          data-ident={a.ident}
          data-open={opened ? "" : undefined}
        />
      }
    >
      <CardThread first={leads} last={last} />
      <section aria-label={`${a.ident} · ${first.role}`}>
        <FieldHead {...{ vm, a, mark, end, tank, wind, reported }} />
        {/* Its runways and procedures under the ident, inside the card. */}
        <CollapsibleContent className="pl-9.5">{partBody(first)}</CollapsibleContent>
      </section>
      {opened && parts[1] && (
        <section aria-label={`${a.ident} · ${parts[1].role}`} className="pl-9.5">
          {partBody(parts[1])}
        </section>
      )}
    </Collapsible>
  );
}
