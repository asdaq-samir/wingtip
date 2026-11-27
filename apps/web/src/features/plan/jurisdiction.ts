import type { NavLogRow } from "./navLogRows";

/** A row's warnings, the engine's words, set on the course's points by the
 *  planner (app.route_borders: route_jurisdiction, each leg checked every
 *  2 nm; decision 0053): `at`, where the route's point at it lies outside
 *  the United States ("CYQT is in Canada (Ontario): …"); `leaving`, where
 *  the leg from it on to the next point crosses a country neither end is
 *  in ("The leg to KBUF crosses Canada (Ontario): …"), said on that leg,
 *  never as the next field's. Both null on a row between, and on a point
 *  the device made (a Direct To's present position). Warn, never limit:
 *  every figure is still by the FAA's rules. */
export interface RowCaution {
  at: string | null;
  leaving: string | null;
}

/** Each row's warnings (RowCaution), the nav log's rows in order. */
export function rowCautions(rows: NavLogRow[]): RowCaution[] {
  return rows.map((row) =>
    row.kind === "departure" || row.kind === "stop" || row.kind === "destination"
      ? { at: row.airport.outside_caution ?? null, leaving: row.airport.leg_caution ?? null }
      : { at: null, leaving: null },
  );
}
