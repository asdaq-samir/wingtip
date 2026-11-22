import { sameField } from "../../lib/procedures";
import { frdOf, isPosition, placeOfPoint, pointName } from "../../lib/identSchema";
import { etaAt, legOf, rowPoint, type NavLogRow, type ProcedureAirport } from "../plan";
import { PointMark } from "../navlog/lazy";
import { PointFigures } from "../route/lazy";
import { FuelGauge } from "./FuelGauge";
import { useProceduresRoute } from "./useProceduresRoute";
import type { ProceduresRouteProps } from "./routeProps";
import { RouteLine } from "./RouteLine";
import { FieldStep } from "./FieldStep";
import { pointEnd } from "./pointEnd";
import { nthTyped } from "./visits";
import { HoldRow, Step } from "./RouteRows";
import { RouteGrid, type RouteItem } from "./RouteGrid";
import { RouteSheets } from "./RouteSheets";
import { WORDING } from "../../lib/wording/generated/wording";

// The list's types and its Routes row, where PlanWorkspace and the
// routePanel chunk import them from.
export type { ProcedureAirport } from "../plan";
export type { FitInputs, ProceduresAt } from "./routeProps";
export { RouteLine } from "./RouteLine";

/**
 * The route in FPL, in the order it is flown, at the owner's ask ("I
 * want to replace navlog with procedures", 2026-10-18), the nav log a
 * button away (NavLogView's sheet): each field of the route a step down a
 * line, holding what is flown there in turn -- a departure's pattern and
 * then its departure, a destination's arrival and approach and then its
 * pattern, a stop's all of them -- and between them the fixes flown
 * through, each with the nav log's own mark (PointMark) and the time it
 * is reached. The checkpoints are the nav log's alone ("Only stops in the
 * route box and separate navlog"), and since the owner's cleanup ("no
 * need to have the toc and tod") the tops of climb and descent too; a
 * field shows only the kinds of procedure it has, and its approach chart
 * is the approach's page's (ProcedurePage's Chart).
 *
 * A pattern is picked by its runway, as a chip, the runway the wind
 * favours marked (the redesign's A); it is drawn on the map
 * (PatternsGl). An instrument procedure from the FAA's CIFP
 * (wingtip.procedures) is picked in a sheet of its own, as ForeFlight's
 * Procedure Advisor picks one: the field's of that kind, then the one
 * procedure, its transition chosen, the map above the sheet drawing it
 * as it is chosen (`onPreview`, ProceduresGl), its fixes listed, and
 * Add to Route at the foot. Its close goes back to the list.
 *
 * The view: its state, its asks and the runways picked into the wind are
 * its view model's (useProceduresRoute).
 */
export default function ProceduresRoute(props: ProceduresRouteProps) {
  const vm = useProceduresRoute(props);
  const { airports, rows, depart, weather, routePoints, routeLine, setHoldAt, holdOn, heldAs, along, pointIndex, tanks, points } = vm;

  // The route's own rows where the course is in: its fields as steps and
  // the fixes flown through between them, the checkpoints and the tops of
  // climb and descent left to the nav log. Before then, the fields alone.
  const steps: RouteItem[] = [];
  const shown = new Set<ProcedureAirport>();
  // Routes, over the route's fields (RouteLine), four points clear of the
  // first field's toggle under it, whose 44-point hit area came 3 up into
  // the Routes row's (the iOS audit's P1, CI on 4d7da5f0).
  const lineRow = routeLine ? <RouteLine line={routeLine} /> : null;
  // Each a row of the list (RouteGrid); a typed point's by its place among them, which moves.
  const fieldStep = (a: ProcedureAirport, row: NavLogRow | undefined, last: boolean, leads: boolean): RouteItem => ({
    id: `${a.role}:${a.ident}`,
    label: `${a.role} ${pointName(a.ident)}`,
    point: pointIndex(a.ident, a.role),
    node: <FieldStep vm={vm} a={a} row={row} last={last} leads={leads} />,
  });
  // A fix flown twice (out and back over VPBNG) is two rows and two typed
  // points: each visit is matched to its own place among the typed points
  // by how many times the fix came before it, so its menu's Move, Add a
  // Stop After and Change work on that visit, not the first (the audit's
  // WEB-2).
  const visits = new Map<string, number>();
  // A hold is flown once, on the leg the planner put it on (heldAs); until
  // the plan says which, after the first visit. Its row is keyed by that
  // row, as two rows keyed by the fix were the same row to React.
  const holdShown = new Set<string>();
  points.forEach((row, i) => {
    const last = i === points.length - 1;
    // By the field, not its spelling: a stop typed UES comes back from the
    // planner as KUES. A round trip's field twice, its departure first.
    const field =
      "airport" in row && row.airport.kind !== "fix"
        ? airports.find((a) => sameField(a.ident, row.airport.ident) && !shown.has(a))
        : undefined;
    // A hold at the point, its own row after it, at the owner's ask
    // ("hold should get its own row").
    const holdRow = (ident: string) => {
      const hold = holdOn(ident);
      if (!hold) return;
      const flownOn = points.find((r) => r.kind !== "departure" && r.leg?.hold && sameField(r.leg.hold.fix, ident));
      if (flownOn ? flownOn !== row : holdShown.has(hold.fix)) return;
      holdShown.add(hold.fix);
      steps.push({
        id: `hold-${row.key}`,
        label: `Hold at ${pointName(ident)}`,
        node: (
          <HoldRow
            hold={hold}
            flown={heldAs(ident)}
            last={last}
            onOpen={() => setHoldAt({ fix: hold.fix, hold, altitudeFt: legOf(row)?.altitude_ft ?? null, arrivalDeg: null })}
          />
        ),
      });
    };
    if (field) {
      shown.add(field);
      steps.push(fieldStep(field, row, last, steps.length === 0));
      if (field.role === "Destination") holdRow(field.ident);
      return;
    }
    // A waypoint the route flies over (VPBNG), or ends at: its altitude
    // and Direct to, as a field's landing has. Not where it starts.
    const time = etaAt(depart || new Date().toISOString(), row.minutesFlown);
    const to = row.kind !== "departure" && "airport" in row && !isPosition(row.airport.ident);
    const seen = to ? (visits.get(row.airport.ident) ?? 0) : 0;
    // Its own altitude by visit only where the route is at it again.
    const again = to && points.filter((r) => r.kind !== "departure" && "airport" in r && r.airport.ident === row.airport.ident).length > 1;
    if (to) visits.set(row.airport.ident, seen + 1);
    const typedAt = to ? nthTyped(routePoints, row.airport.ident, seen) : -1;
    const end = to
      ? pointEnd(vm, row.airport.ident, {
          time,
          waypoint: true,
          elevationFt: null,
          to: true,
          stop: row.kind === "stop",
          holdable: true,
          row,
          index: typedAt >= 0 ? typedAt : undefined,
          visit: again ? seen + 1 : undefined,
        })
      : null;
    steps.push({
      id: row.key,
      label: rowPoint(row).name,
      point: typedAt >= 0 ? typedAt : undefined,
      node: (
        <Step
          last={last}
          mark={<PointMark row={row} number={undefined} weather={weather} />}
          title={rowPoint(row).name}
          testId={`route-${row.kind}`}
          icon={
            tanks.has(row.key) ? (
              <FuelGauge
                gal={tanks.get(row.key)!.gal}
                usable={tanks.get(row.key)!.usable}
                tone={tanks.get(row.key)!.low ? "low" : undefined}
              />
            ) : undefined
          }
          // A present position, POS0, by its coordinates under it, where its
          // role was ("Instead of Departure under POS0, say the coordinates").
          // Direct to in the line's own colour: it says how the leg is
          // flown, and only what is tapped is in the tint.
          sub={
            end?.direct ? (
              <span className="font-semibold">{WORDING.directTo}</span>
            ) : (
              `${row.kind === "stop" ? (to && frdOf(row.airport.ident) ? row.airport.name : "Fly over") : row.kind === "destination" ? "Destination" : "airport" in row && isPosition(row.airport.ident) ? placeOfPoint(row.airport.ident) : "Departure"}${along(row)}`
            )
          }
          figures={end?.figures ?? <PointFigures time={time} altitude={null} kind="cruise" />}
          menu={end?.menu}
          grip={end?.grip}
        />
      ),
    });
    if (to) holdRow(row.airport.ident);
  });
  const fieldsAlone = rows.length === 0 ? airports.map((a, i) => fieldStep(a, undefined, i === airports.length - 1, i === 0)) : null;

  return (
    <>
      {lineRow}
      <RouteSheets vm={vm}>
        <div className="pt-2 pb-1">
          <RouteGrid items={fieldsAlone ?? steps} />
        </div>
      </RouteSheets>
    </>
  );
}
