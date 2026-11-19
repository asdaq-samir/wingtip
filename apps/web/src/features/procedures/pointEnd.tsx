import type { ReactNode } from "react";
import { sameField } from "../../lib/procedures";
import { altFt } from "../../lib/format";
import { isFixIdent, isPosition, pointName, visitKey } from "../../lib/identSchema";
import { PointFigures, PointMenu } from "../route/lazy";
import { askSearchPick } from "../../lib/oneSearch";
import { legOf, type NavLogRow } from "../plan";
import type { ProceduresRouteModel } from "./useProceduresRoute";
import { PointGrip } from "./RouteGrid";

/** A stop's Remove, where its row's menu has one: one the pilot typed,
 *  taken out of the route by the menu's own handler (its Undo the plan's)
 *  -- this visit alone, by its place (`index`), where the route is at the
 *  point more than once. */
function stopRemoval(vm: ProceduresRouteModel, ident: string, stop: boolean, index?: number): (() => void) | undefined {
  if (!stop || !vm.routePoints.some((p) => sameField(p, ident))) return undefined;
  return () => vm.onRemove(ident, index);
}

/**
 * A point of the route changed, the owner's "Changeable by tapping"
 * (2026-11-17, Apple Maps' Directions as the model): the one search asked
 * for the point to put in its place, My Location first where the point is
 * an end and not it already, and the pick put there (a Direct To's start
 * changed is a route from there; the plan's Undo takes it back). A stop
 * may be a fix, never My Location (placeAllowed); an end is an airport or
 * My Location.
 */
function askChange(vm: ProceduresRouteModel, ident: string, index: number, stop: boolean, fixes: boolean) {
  const edit = vm.edit;
  if (!edit) return;
  askSearchPick({
    label: `In place of ${pointName(ident)}`,
    fixes,
    position: !isPosition(ident) && !stop,
    onPick: (picked) => {
      if (!sameField(picked, ident)) edit.onReplace(index, isPosition(picked) ? picked : picked.toUpperCase());
    },
  });
}

/** The hold sheet (HoldSheet) opened at a point, from its menu's Hold or
 *  the destination's "+ HOLD" chip: the hold there now, and the leg flown
 *  to it -- its altitude, and its own magnetic course, the planner's (the
 *  engine's variation), as the leg's card says it (useLegSheet). */
export function askHold(vm: ProceduresRouteModel, ident: string, row: NavLogRow | undefined) {
  const leg = row ? legOf(row) : undefined;
  vm.setHoldAt({ fix: ident, hold: vm.holdOn(ident), altitudeFt: leg?.altitude_ft ?? null, arrivalDeg: leg?.magnetic_course_deg ?? null });
}

// The end of a point's row, at the owner's picks ("keep the format of
// altitude (elev/published/cruising) and eta to the right side of each
// depart/arrive and waypoints"; "Each stop can have a menu (set altitude,
// create a fix, hold here, More Info)"; "the menu can include direct
// to"): its time over its altitude -- the pilot's own (the address's
// `altitudes`), else a waypoint's cruise to it, a field's elevation --
// and its menu. `to`, a point flown to: Direct to it and its altitude
// set there; `stop`, one the route's points can lose.
export function pointEnd(
  vm: ProceduresRouteModel,
  ident: string,
  at: {
    time: ReactNode;
    waypoint: boolean;
    elevationFt: number | null;
    to: boolean;
    stop: boolean;
    holdable?: boolean;
    row?: NavLogRow;
    index?: number;
    /** At a point the route is at more than once, which visit this is,
     *  from 1: its own altitude is that visit's (visitKey; WEB-2). */
    visit?: number;
  },
) {
  const { pointAltitude, directTo, routePoints, positioned, onDirectTo, setEditing, onInfo, stopsFull, setFixFrom, holdOn, edit } = vm;
  const asked = at.to ? pointAltitude(ident, at.waypoint, at.visit) : undefined;
  // A waypoint's cruise to it is this row's own leg's: a fix flown twice
  // read the first visit's at both (the audit's WEB-2). The pilot's own
  // is the visit's where the route is at it more than once (at.visit).
  const legFt = at.waypoint && at.row ? legOf(at.row)?.altitude_ft : undefined;
  const altitude = asked && !asked.own && legFt != null ? { ...asked, feet: legFt } : asked;
  const own = altitude?.own ? altitude.feet : null;
  const shown = own ?? (at.waypoint ? (altitude?.feet ?? null) : at.elevationFt);
  const direct = directTo !== null && sameField(directTo, ident);
  const typed = routePoints.some((p) => sameField(p, ident));
  // Direct to a round trip's end on the ground, with no position, is from
  // the field to itself: a local flight, not a direct (the audit's).
  const homeward = routePoints.length > 1 && sameField(routePoints[0]!, ident) && !positioned;
  const kind = own !== null ? "set" : at.waypoint ? "cruise" : "elev";
  // With no airplane picked every time is a dash: the one ask for an
  // airplane is the N-number field and the strip's dashes, where the
  // arrival's row had a "Pick an airplane" of its own (the UI audit's C3,
  // the owner's word 2026-11-17).
  return {
    direct,
    figures: <PointFigures time={at.time} altitude={shown === null ? null : altFt(shown)} kind={kind} />,
    // The two apart, for an airport's block: the time on its ident's
    // line, the elevation on its wind's.
    time: <PointFigures time={at.time} altitude={null} kind={kind} />,
    elevation: <PointFigures time={null} altitude={shown === null ? null : altFt(shown)} kind={kind} />,
    // Behind the point's mark (`face`), at the owner's ask ("Use the
    // airport icon as the more button instead of having one to the right").
    menu: (face: ReactNode, bare = false) => (
      <PointMenu
        face={face}
        bare={bare}
        ident={ident}
        direct={direct}
        onDirect={at.to && typed && !homeward ? () => onDirectTo(direct ? null : ident) : undefined}
        onAltitude={
          at.to && altitude
            ? () => setEditing({ ident, key: visitKey(ident, at.visit), waypoint: at.waypoint, altitude, elevationFt: at.elevationFt })
            : undefined
        }
        // An airport's card; a waypoint's is the chart's popup.
        onInfo={!at.waypoint ? () => onInfo(ident) : undefined}
        // Off a fix, a navaid or an airport by its ident: not off the
        // pilot's own point, nor a present position.
        onFix={typed && !stopsFull && isFixIdent(ident) ? () => setFixFrom(ident) : undefined}
        // Held over a point flown over, or before landing at the end:
        // not over a field landed at on the way, where it is left again.
        held={!!holdOn(ident)}
        onHold={at.holdable ? () => askHold(vm, ident, at.row) : undefined}
        // An airport changed here, by the one search asked for an airport,
        // its ident a link to its card (FieldHead; the owner, 2026-11-17:
        // "Can we make the airports/stops tappable as the navlog does?").
        onChange={edit && at.index !== undefined ? () => askChange(vm, ident, at.index!, at.stop, at.stop || at.waypoint) : undefined}
        onAddAfter={
          edit && at.index !== undefined && at.index < routePoints.length - 1 && !stopsFull ? () => edit.onAddAt(at.index! + 1) : undefined
        }
        onMoveUp={
          edit && at.index !== undefined && at.index > 0 && edit.canMove(at.index, at.index - 1)
            ? () => edit.onMove(at.index!, at.index! - 1)
            : undefined
        }
        onMoveDown={
          edit && at.index !== undefined && at.index < routePoints.length - 1 && edit.canMove(at.index, at.index + 1)
            ? () => edit.onMove(at.index!, at.index! + 1)
            : undefined
        }
        onRemove={stopRemoval(vm, ident, at.stop, at.index)}
      />
    ),
    // A tap on its name, where the list changes the route: the one search
    // asked for what goes in its place, its suggestions under the field and
    // My Location first at an end (the owner, 2026-11-19: "when the stop is
    // tapped it should be editable with suggestions. The first one can also
    // suggest my location"); its card is its menu's More Info.
    change: edit && at.index !== undefined ? () => askChange(vm, ident, at.index!, at.stop, at.stop || at.waypoint) : undefined,
    // Its grip, where the list changes the route: by its place among the
    // typed points.
    grip: edit && at.index !== undefined ? <PointGrip ident={ident} /> : null,
  };
}
