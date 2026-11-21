import { feet } from "../../lib/format";
import { altFt, isLegPoint, legOf, windText } from "../plan";
import type { NavLogRow } from "../plan";

/** The wind a leg was worked out in, as the nav log says it (true, as the
 *  forecast's winds aloft are). */
function windOf(row: NavLogRow): string | null {
  const leg = legOf(row);
  if (!leg) return null;
  return leg.wind ? windText(leg.wind.wind_dir_true_deg, leg.wind.wind_speed_kt, null, "T") : "no data";
}

/** The airway a leg flies and its published altitudes, as a paper IFR
 *  nav log's route column has them: "V191 · MEA 4,000 · MOCA 2,600", the
 *  GNSS MEA where the segment publishes no other (a T route's). The MEA
 *  is the floor under IFR (14 CFR 91.177(a)(1)); the MOCA is legal below
 *  it within 22 nm of the VOR, said, not flown (wingtip.airways). */
function airwayOf(row: NavLogRow): string | null {
  const airway = legOf(row)?.airway;
  if (!airway) return null;
  const mea =
    airway.mea_ft != null ? `MEA ${altFt(airway.mea_ft)}` : airway.gnss_mea_ft != null ? `GNSS MEA ${altFt(airway.gnss_mea_ft)}` : null;
  return [airway.id, mea, airway.moca_ft != null ? `MOCA ${altFt(airway.moca_ft)}` : null].filter(Boolean).join(" · ");
}

/** What each row says beside its leg's own figures, worked out in order:
 *  the wind where it is not the leg's before (and over the first), the
 *  airway and its altitudes where they are not, and the altitude where it
 *  is not -- a field's elevation, a top of climb's or descent's level, a
 *  step. */
export function railOf(rows: NavLogRow[]): { wind: string | null; airway: string | null; altitude: string }[] {
  let windBefore: string | null = null;
  let airwayBefore: string | null = null;
  let altitudeBefore: number | null = null;
  return rows.map((row) => {
    const wind = windOf(row);
    const changed = wind !== null && wind !== windBefore ? wind : null;
    if (wind !== null) windBefore = wind;
    const route = airwayOf(row);
    const joined = route !== null && route !== airwayBefore ? route : null;
    airwayBefore = route;
    // A field's elevation only at an airport: a present position (POS0)
    // is a "fix" there too, its "field — ft" said of no field.
    const field = (row.kind === "departure" || row.kind === "destination" || row.kind === "stop") && row.airport.kind !== "fix";
    const legAltitude = isLegPoint(row) ? row.point.altitude_ft : (legOf(row)?.altitude_ft ?? null);
    const altitude = field
      ? `field ${altFt("airport" in row ? row.airport.elevation_ft : null)} ft`
      : legAltitude !== null && (isLegPoint(row) || legAltitude !== altitudeBefore)
        ? feet(legAltitude)
        : "";
    if (legAltitude !== null) altitudeBefore = legAltitude;
    return { wind: changed, airway: joined, altitude };
  });
}
