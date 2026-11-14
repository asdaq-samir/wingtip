import { useState } from "react";
import { normalizeDeg } from "../../../lib/geo";
import { sameField, type PickedProcedure } from "../../../lib/procedures";
import type { EditedPoint } from "../components/PointAltitudeDialog";
import type { HoldAt } from "../components/HoldSheet";
import type { Hold } from "../lib/routeHolds";
import { legOf, type NavLogRow } from "../components/navlog/rows";

/** The one sheet FPL's route list has open over it (ProceduresRoute): a
 *  point's altitude (PointAltitudeDialog), a fix made off a point
 *  (FixFromDialog), a hold (HoldSheet) or an approach taught
 *  (ApproachLesson). One at a time, so one value. */
type RouteSheet =
  | { kind: "altitude"; point: EditedPoint }
  | { kind: "fixFrom"; from: string }
  | { kind: "hold"; at: HoldAt }
  | { kind: "lesson"; procedure: PickedProcedure };
type Kind = RouteSheet["kind"];

/**
 * The sheets FPL's route list opens (the audit's WEB-19, out of its view
 * model): which one is up, and each one drawn from its first opening on so
 * it closes as a sheet does, eased away by its own Drawer rather than
 * taken out from under it. A hold asked for from elsewhere (AirspaceCard's
 * Hold here, `askHold`) opens its sheet once the plan has the leg to it.
 */
export function useRouteSheets({ holds, rows, askHold }: { holds: Hold[]; rows: NavLogRow[]; askHold: string | null }) {
  const [sheet, setSheet] = useState<RouteSheet | null>(null);
  const [used, setUsed] = useState<ReadonlySet<Kind>>(() => new Set());
  if (sheet && !used.has(sheet.kind)) setUsed(new Set([...used, sheet.kind]));
  // Opened with its value; closed (null) only where it is the one up.
  const setter =
    <T>(kind: Kind, make: (value: T) => RouteSheet) =>
    (value: T | null) =>
      setSheet((now) => (value !== null ? make(value) : now?.kind === kind ? null : now));
  const setEditing = setter<EditedPoint>("altitude", (point) => ({ kind: "altitude", point }));
  const setFixFrom = setter<string>("fixFrom", (from) => ({ kind: "fixFrom", from }));
  const setHoldAt = setter<HoldAt>("hold", (at) => ({ kind: "hold", at }));
  const setLesson = setter<PickedProcedure>("lesson", (procedure) => ({ kind: "lesson", procedure }));
  const holdOn = (ident: string) => holds.find((h) => sameField(h.fix, ident)) ?? null;
  const [answered, setAnswered] = useState<string | null>(null);
  if (askHold && askHold !== answered) {
    const fix = askHold.slice(0, askHold.lastIndexOf("@"));
    const to = rows.find((r) => "airport" in r && sameField(r.airport.ident, fix));
    const leg = to ? legOf(to) : undefined;
    if (leg) {
      setAnswered(askHold);
      setSheet({
        kind: "hold",
        at: {
          fix,
          hold: holdOn(fix),
          altitudeFt: leg.altitude_ft,
          // Magnetic = true - variation, east positive (the leg's own).
          arrivalDeg: normalizeDeg(leg.true_course_deg - leg.magnetic_variation_deg),
        },
      });
    }
  }
  return {
    editing: sheet?.kind === "altitude" ? sheet.point : null,
    setEditing,
    editingUsed: used.has("altitude"),
    fixFrom: sheet?.kind === "fixFrom" ? sheet.from : null,
    setFixFrom,
    fixFromUsed: used.has("fixFrom"),
    holdAt: sheet?.kind === "hold" ? sheet.at : null,
    setHoldAt,
    holdUsed: used.has("hold"),
    lesson: sheet?.kind === "lesson" ? sheet.procedure : null,
    setLesson,
    lessonUsed: used.has("lesson"),
    holdOn,
  };
}
