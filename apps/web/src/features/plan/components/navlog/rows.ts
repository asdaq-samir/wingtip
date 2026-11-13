import type { Airport, Candidate, Course, Leg, SaveFlightRequest, TopOfClimb, TopOfDescent } from "../../../../lib/api/types";
import { callEngine } from "../../../../lib/engine/engine";
import { pointName } from "../../../../lib/identSchema";
import { descriptionKey } from "../../hooks/useCheckpointNotes";

/**
 * The nav log's rows, in the order they are flown: the departure, each
 * selected checkpoint, any stop it lands at on the way, the destination.
 * Each row says which it is, rather than the kind being worked out from
 * which other fields happen to be empty, and carries the minutes flown
 * to reach it -- the departure's 0, then each leg's ETE added on, null
 * from the first leg that is not in yet or cannot be flown.
 *
 * The legs come in the same order: one arriving at every row after the
 * departure. A route with stops is a run of hops, and a checkpoint's
 * `hop` says which: its checkpoints, then the stop it ends at. Legs
 * stream in one at a time, so a later row's `leg` can still be
 * undefined.
 *
 * Built from the course's own airports: until the course is known there
 * are no rows at all (not a destination at 0, 0), and a route with no
 * checkpoints is still a departure and a destination with the one leg
 * between them.
 *
 * Where a climb tops out (TOC) or a descent starts (TOD), on the way
 * along a leg, the point is a row of its own, as on a paper nav log: the
 * leg is cut there, and each row shows the piece of it that arrives
 * there (`part`) -- its miles, minutes and fuel, and up to a top of
 * climb the climb's speeds -- where `leg` is still the whole leg.
 *
 * `minutesFlown` is the time from the departure to the row, for its ETA:
 * the legs' minutes, and after each stop landed at its time on the ground.
 */
export type NavLogRow =
  | { kind: "departure"; key: string; airport: Airport; minutesFlown: number }
  | { kind: "checkpoint"; key: string; cp: Candidate; leg: Leg | undefined; part?: Leg; minutesFlown: number | null }
  | {
      kind: "stop";
      key: string;
      airport: Airport;
      leg: Leg | undefined;
      part?: Leg;
      minutesFlown: number | null;
      /** Its minutes on the ground before it is left again (groundMinAt);
       *  a waypoint's none. */
      groundMin: number;
    }
  | { kind: "destination"; key: string; airport: Airport; leg: Leg | undefined; part?: Leg; minutesFlown: number | null }
  | { kind: "toc"; key: string; point: TopOfClimb; leg: Leg; part: Leg; minutesFlown: number | null }
  | { kind: "tod"; key: string; point: TopOfDescent; leg: Leg; part: Leg; minutesFlown: number | null };

type LegPointOn = { kind: "toc"; point: TopOfClimb } | { kind: "tod"; point: TopOfDescent };

/** A leg's tops of climb and descent, in the order flown. */
function pointsOn(leg: Leg | undefined): LegPointOn[] {
  const points: LegPointOn[] = [];
  if (leg?.toc) points.push({ kind: "toc", point: leg.toc });
  if (leg?.tod) points.push({ kind: "tod", point: leg.tod });
  return points.sort((a, b) => a.point.along_nm - b.point.along_nm);
}

/** The piece of `leg` from one point on it to the next: the miles,
 *  minutes and fuel between them. */
function piece(leg: Leg, from: { nm: number; min: number; gal: number }, to: { nm: number; min: number | null; gal: number | null }): Leg {
  const less = (a: number | null, b: number) => (a === null ? null : Math.max(0, a - b));
  return { ...leg, distance_nm: Math.max(0, to.nm - from.nm), ete_min: less(to.min, from.min), fuel_gal: less(to.gal, from.gal) };
}

/** The piece of a leg up to its top of climb with the climb's own
 *  figures rather than the cruise's: its speeds, heading and fuel flow (the
 *  engine's with_climbs), so the piece's miles over its minutes are its
 *  ground speed. */
function climbPiece(part: Leg, toc: TopOfClimb): Leg {
  return {
    ...part,
    tas_kt: toc.tas_kt,
    groundspeed_kt: toc.groundspeed_kt,
    fuel_burn_gph: toc.fuel_burn_gph ?? part.fuel_burn_gph,
    wca_deg: toc.wca_deg ?? part.wca_deg,
    true_heading_deg: toc.true_heading_deg ?? part.true_heading_deg,
    magnetic_heading_deg: toc.magnetic_heading_deg ?? part.magnetic_heading_deg,
    phase: "climb",
  };
}

/** The piece of a leg after its top of descent with the descent's own
 *  figures, where the airplane has them (the engine's descent_phase): its
 *  speeds, heading and flow, the piece's ground speed its miles over its
 *  minutes. On the cruise's (`descent_at_cruise`), the piece as it is. */
function descentPiece(part: Leg, tod: TopOfDescent): Leg {
  if (tod.descent_at_cruise !== false || tod.tas_kt == null || tod.groundspeed_kt == null) return part;
  return {
    ...part,
    tas_kt: tod.tas_kt,
    groundspeed_kt: tod.groundspeed_kt,
    fuel_burn_gph: tod.fuel_burn_gph ?? part.fuel_burn_gph,
    wca_deg: tod.wca_deg ?? part.wca_deg,
    true_heading_deg: tod.true_heading_deg ?? part.true_heading_deg,
    magnetic_heading_deg: tod.magnetic_heading_deg ?? part.magnetic_heading_deg,
    phase: "descent",
  };
}

/** A leg as it is first flown, for what a pilot does on from its start:
 *  up to a top of climb on it, the climb's own figures (climbPiece). */
export const firstFlown = (leg: Leg | undefined): Leg | undefined => (leg?.toc ? climbPiece(leg, leg.toc) : leg);

export type RouteEnds = Pick<Course, "departure" | "destination"> &
  Partial<Pick<Course, "stops">> & {
    /** Minutes on the ground at the stops, by ident (the address's
     *  `ground`): a landing stop not named, the planner's (groundMinAt). */
    ground?: Record<string, number>;
  };

/** The time on the ground at a stop the pilot gave none for, min: a
 *  turnaround, at the owner's pick (2026-10-20), the engine's
 *  (`planning_figures`), as the planner counts it. The planner says each
 *  stop's on the leg landing there (Leg.ground_min); this is for the rows
 *  drawn before that leg is in -- the route list before the nav log, a
 *  plan streaming. */
export const turnaroundMin = (): number => callEngine("planning_figures", {}).turnaround_min;

/** A stop's minutes on the ground: the pilot's own (the address's
 *  `ground`, newer than a plan still on its way), else the planner's on
 *  the leg landing there, else turnaroundMin() until that leg is in. */
export function groundMinAt(ground: Record<string, number> | undefined, ident: string, landing?: Leg): number {
  return ground?.[ident] ?? landing?.ground_min ?? turnaroundMin();
}

export function navLogRows(ends: RouteEnds | null, selected: Candidate[], legs: Leg[]): NavLogRow[] {
  if (!ends) return [];
  let flown: number | null = 0;
  const minutesTo = (leg: Leg | undefined): number | null => {
    flown = flown === null || !leg || leg.ete_min === null ? null : flown + leg.ete_min;
    return flown;
  };
  let next = 0;
  const rows: NavLogRow[] = [{ kind: "departure", key: "departure", airport: ends.departure, minutesFlown: 0 }];
  // The next leg, its TOC and TOD rows first, and the piece of it that
  // arrives at the row it ends at.
  const arriving = (): { leg: Leg | undefined; part?: Leg } => {
    const at = next++;
    const leg = legs[at];
    const points = pointsOn(leg);
    if (!leg || points.length === 0) return { leg };
    let from = { nm: 0, min: 0, gal: 0 };
    for (const on of points) {
      const { point } = on;
      // Not flown by the leg's procedure: its minutes are the piece that
      // ends the leg's (procedureOf), and the leg's workings would count
      // them where they are not (features/plan/components/navlog/workings).
      const part = { ...piece(leg, from, { nm: point.along_nm, min: point.ete_min, gal: point.fuel_gal }), procedure: null };
      const key = `${on.kind}-${at}`;
      // Up to a top of climb, the climb's own figures (climbPiece).
      if (on.kind === "toc") {
        const climb = climbPiece(part, on.point);
        rows.push({ kind: "toc", key, point: on.point, leg, part: climb, minutesFlown: minutesTo(climb) });
      } else {
        rows.push({ kind: "tod", key, point: on.point, leg, part, minutesFlown: minutesTo(part) });
      }
      from = { nm: point.along_nm, min: point.ete_min, gal: point.fuel_gal ?? 0 };
    }
    // After a top of descent, the descent's own figures (descentPiece).
    const rest = piece(leg, from, { nm: leg.distance_nm, min: leg.ete_min, gal: leg.fuel_gal });
    return { leg, part: leg.tod ? descentPiece(rest, leg.tod) : rest };
  };
  const stops = ends.stops ?? [];
  for (let hop = 0; hop <= stops.length; hop++) {
    for (const cp of selected.filter((c) => (c.hop ?? 0) === hop)) {
      const { leg, part } = arriving();
      rows.push({ kind: "checkpoint", key: descriptionKey(cp.lat, cp.lon), cp, leg, part, minutesFlown: minutesTo(part ?? leg) });
    }
    const stop = stops[hop];
    if (stop) {
      const { leg, part } = arriving();
      const groundMin = stop.kind === "fix" ? 0 : groundMinAt(ends.ground, stop.ident, leg);
      rows.push({ kind: "stop", key: `stop-${hop}`, airport: stop, leg, part, minutesFlown: minutesTo(part ?? leg), groundMin });
      // Landed: its arrival its own row's time, the rows after it from
      // when it leaves again.
      if (flown !== null) flown += groundMin;
    }
  }
  const { leg: last, part } = arriving();
  rows.push({ kind: "destination", key: "destination", airport: ends.destination, leg: last, part, minutesFlown: minutesTo(part ?? last) });
  return rows;
}

/** What a row's figures are: the piece of its leg that arrives at it,
 *  the whole leg where nothing cuts it; the departure has none. */
export const legOf = (row: NavLogRow): Leg | undefined => (row.kind === "departure" ? undefined : (row.part ?? row.leg));

/** The one phase a row is flown in, so its workings are worded for it:
 *  the piece up to a top of climb or after a top of descent (climbPiece,
 *  descentPiece), or a leg the engine flew whole in the climb or the
 *  descent (its `phase`); else the cruise. */
export const phaseOf = (row: NavLogRow): "climb" | "descent" | "cruise" => legOf(row)?.phase ?? "cruise";

/**
 * The miles a row's leg is flown beyond its own straight line, where it
 * is flown by a procedure: a traffic pattern's departure or entry and
 * legs, a departure procedure, an approach. The planner puts their
 * minutes and fuel in the leg's `ete_min` and `fuel_gal` at the leg's
 * ground speed (the planner's plan.with_procedures; LegProcedure's
 * `more_nm`, `more_min`) and their miles in the totals' distance
 * (`procedure_nm`), but not in the leg's `distance_nm`, the chart's line.
 * Said on the row that ends the leg, where the minutes fall (a top of
 * climb or descent cuts the leg before them), so its miles over its
 * ground speed come to its minutes: "1.5 nm · 3.4 min" read as 1.5 nm
 * at 86 kt, a minute, with 2.3 unsaid (the FPL audit's A4, 2026-11-08).
 * What it is: a departure, a pattern landed by, or an approach.
 */
export function procedureOf(row: NavLogRow): { nm: number; min: number | null; word: "departure" | "pattern" | "approach" } | null {
  if (row.kind === "departure" || isLegPoint(row)) return null;
  const p = row.leg?.procedure;
  if (!p || !(p.more_nm > 0.05)) return null;
  const word = !p.landing ? "departure" : p.final_at == null && p.missed == null ? "pattern" : "approach";
  return { nm: p.more_nm, min: p.more_min, word };
}

/** The miles a row says it flies: its piece of the chart's line, and on
 *  the row that ends a leg flown by a procedure, the procedure's more
 *  (procedureOf) -- the totals' distance, as the strip gives it. */
export function flownNmOf(row: NavLogRow): number | null {
  const leg = legOf(row);
  return leg ? leg.distance_nm + (procedureOf(row)?.nm ?? 0) : null;
}

/** The tops of climb and descent: rows of their own, and not filed. */
export const isLegPoint = (row: NavLogRow): row is Extract<NavLogRow, { kind: "toc" | "tod" }> => row.kind === "toc" || row.kind === "tod";

/** A row's place on the chart and the name the log shows for it. */
export function rowPoint(row: NavLogRow): { name: string; lat: number; lon: number } {
  if (row.kind === "checkpoint") return { name: row.cp.name || row.cp.category, lat: row.cp.lat, lon: row.cp.lon };
  if (isLegPoint(row)) return { name: row.kind.toUpperCase(), lat: row.point.lat, lon: row.point.lon };
  // A present position by its coordinates, as the route's box names it
  // (pointName), where the log, the kneeboard and the map's card showed
  // the planner's own "@42.3246,-88.0741,3500".
  return { name: pointName(row.airport.ident), lat: row.airport.lat, lon: row.airport.lon };
}

/** A leg of the route as the map draws it and a tap on the course opens
 *  (RouteLegCard): from one row to the next, the tops of climb and
 *  descent being points on a leg rather than its ends, keyed by the row it
 *  arrives at. `leg` is the whole leg's figures, the engine's, undefined
 *  until it streams in. */
export interface RouteLeg {
  key: string;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  /** The row it arrives at, for what can be done to that point. */
  toRow: Exclude<NavLogRow, { kind: "departure" | "toc" | "tod" }>;
  leg: Leg | undefined;
}

export function routeLegs(rows: NavLogRow[]): RouteLeg[] {
  const ends = rows.filter((row): row is Exclude<NavLogRow, { kind: "toc" | "tod" }> => !isLegPoint(row));
  return ends
    .slice(1)
    .flatMap((row, i) =>
      row.kind === "departure" ? [] : [{ key: row.key, from: rowPoint(ends[i]!), to: rowPoint(row), toRow: row, leg: row.leg }],
    );
}

/**
 * The same rows as a filed flight's checkpoints, the shape Spring stores:
 * `sequenceNo` from 0, the airports' categories "departure", "stop" and
 * "destination" (and "waypoint" for a fix flown through), and the destination's along-track distance the route's
 * whole length -- a stop's, the legs' to it. Whole legs, fix to fix: the
 * tops of climb and descent are the planner's, worked out again from
 * the legs, not checkpoints.
 */
export function savedCheckpoints(rows: NavLogRow[], distanceNm: number): SaveFlightRequest["checkpoints"] {
  let flownNm = 0;
  return rows
    .filter((row): row is Exclude<NavLogRow, { kind: "toc" | "tod" }> => !isLegPoint(row))
    .map((row, sequenceNo) => {
      const { name, lat, lon } = rowPoint(row);
      const leg = row.kind === "departure" ? undefined : row.leg;
      flownNm += leg?.distance_nm ?? 0;
      return {
        // An airport's as the planner names it -- a present position its own
        // "@lat,lon,alt" -- what is stored, not the coordinates it is shown by.
        sequenceNo,
        name: row.kind === "checkpoint" ? name : row.airport.ident,
        lat,
        lon,
        category: row.kind === "checkpoint" ? row.cp.category : row.kind === "stop" && row.airport.kind === "fix" ? "waypoint" : row.kind,
        alongTrackNm:
          row.kind === "departure"
            ? 0
            : row.kind === "checkpoint"
              ? row.cp.along_track_nm
              : row.kind === "stop"
                ? Math.round(flownNm * 10) / 10
                : distanceNm,
        legDistanceNm: leg?.distance_nm ?? null,
        trueCourseDeg: leg?.true_course_deg ?? null,
        magneticHeadingDeg: leg?.magnetic_heading_deg ?? null,
        groundspeedKt: leg?.groundspeed_kt ?? null,
        eteMin: leg?.ete_min ?? null,
        fuelGal: leg?.fuel_gal ?? null,
        // Each leg's own altitude: a plan may step, so the flight's one
        // cruise altitude is not the whole story.
        altitudeFt: leg?.altitude_ft ?? null,
      };
    });
}
