import type { ReactNode } from "react";
import { normalizeDeg } from "../../../../lib/geo";
import { sameField } from "../../../../lib/procedures";
import { altFt } from "../../../../lib/format";
import { isFixIdent } from "../../../../lib/identSchema";
import { PointFigures, PointMenu } from "../PointControls";
import { legOf, type NavLogRow } from "../navlog/rows";
import type { ProceduresRouteModel } from "../../hooks/useProceduresRoute";
import { PointGrip } from "./RouteGrid";

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
  },
) {
  const {
    pointAltitude,
    directTo,
    routePoints,
    positioned,
    onDirectTo,
    setEditing,
    onInfo,
    stopsFull,
    setFixFrom,
    holdOn,
    setHoldAt,
    edit,
    onRemove,
  } = vm;
  const altitude = at.to ? pointAltitude(ident, at.waypoint) : undefined;
  const own = altitude?.own ? altitude.feet : null;
  const shown = own ?? (at.waypoint ? (altitude?.feet ?? null) : at.elevationFt);
  const direct = directTo !== null && sameField(directTo, ident);
  const typed = routePoints.some((p) => sameField(p, ident));
  // Direct to a round trip's end on the ground, with no position, is from
  // the field to itself: a local flight, not a direct (the audit's).
  const homeward = routePoints.length > 1 && sameField(routePoints[0]!, ident) && !positioned;
  const kind = own !== null ? "set" : at.waypoint ? "cruise" : "elev";
  return {
    direct,
    figures: <PointFigures time={at.time} altitude={shown === null ? null : altFt(shown)} kind={kind} />,
    // The two apart, for an airport's block: the time on its ident's
    // line, the elevation on its wind's.
    time: <PointFigures time={at.time} altitude={null} kind={kind} />,
    elevation: <PointFigures time={null} altitude={shown === null ? null : altFt(shown)} kind={kind} testId="point-elevation" />,
    // Behind the point's mark (`face`), at the owner's ask ("Use the
    // airport icon as the more button instead of having one to the right").
    menu: (face: ReactNode) => (
      <PointMenu
        face={face}
        ident={ident}
        direct={direct}
        onDirect={at.to && typed && !homeward ? () => onDirectTo(direct ? null : ident) : undefined}
        onAltitude={
          at.to && altitude ? () => setEditing({ ident, waypoint: at.waypoint, altitude, elevationFt: at.elevationFt }) : undefined
        }
        // An airport's card; a waypoint's is the chart's popup.
        onInfo={!at.waypoint ? () => onInfo(ident) : undefined}
        // Off a fix, a navaid or an airport by its ident: not off the
        // pilot's own point, nor a present position.
        onFix={typed && !stopsFull && isFixIdent(ident) ? () => setFixFrom(ident) : undefined}
        // Held over a point flown over, or before landing at the end:
        // not over a field landed at on the way, where it is left again.
        held={!!holdOn(ident)}
        onHold={
          at.holdable
            ? () => {
                const leg = at.row ? legOf(at.row) : undefined;
                setHoldAt({
                  fix: ident,
                  hold: holdOn(ident),
                  altitudeFt: leg?.altitude_ft ?? null,
                  // Magnetic = true - variation, east positive (the leg's own).
                  arrivalDeg: leg ? normalizeDeg(leg.true_course_deg - leg.magnetic_variation_deg) : null,
                });
              }
            : undefined
        }
        // Not after the destination: what follows it is a new
        // destination, the route box's own (its end).
        onChange={edit?.onChange && typed ? edit.onChange : undefined}
        onAddAfter={
          edit && at.index !== undefined && at.index < routePoints.length - 1 && !stopsFull ? () => edit.onAddAt(at.index! + 1) : undefined
        }
        onMoveUp={edit && at.index !== undefined && at.index > 0 ? () => edit.onMove(at.index!, at.index! - 1) : undefined}
        onMoveDown={
          edit && at.index !== undefined && at.index < routePoints.length - 1 ? () => edit.onMove(at.index!, at.index! + 1) : undefined
        }
        onRemove={at.stop && typed ? () => onRemove(ident) : undefined}
      />
    ),
    // Its grip, where the list changes the route: by its place among the
    // typed points.
    grip: edit && at.index !== undefined ? <PointGrip ident={ident} /> : null,
  };
}
