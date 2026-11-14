import { feet, zuluTime } from "../../../../lib/format";
import type { Metar } from "../../../../lib/api/types";
import { placeWind } from "./placeWind";

/** The field's own report in a line under the airport card's tabs (the
 *  owner's T4, 2026-11-14), after its category: the ceiling, the wind and
 *  when it was observed, "Ceiling 1,800 ft · 310°T 4 kt · 1255Z", each
 *  as the card writes it elsewhere. The ceiling is the planner's reading
 *  of the report (the lowest broken or overcast layer or the vertical
 *  visibility, 14 CFR 1.1), "No ceiling" with none, and left out where the
 *  report could not say (`ceiling_unknown`); the wind true, as METAR winds
 *  are (FAA JO 7900.5), left out when not reported; the time UTC, as the
 *  report gives it. */
export function weatherLineOf(
  metar: Pick<Metar, "ceiling_ft" | "ceiling_unknown" | "wind_speed_kt" | "wind_dir_true_deg" | "wind_gust_kt" | "observed_at">,
): string {
  const ceiling = metar.ceiling_unknown ? null : metar.ceiling_ft == null ? "No ceiling" : `Ceiling ${feet(metar.ceiling_ft)}`;
  const wind = metar.wind_speed_kt == null ? null : placeWind(metar);
  const at = metar.observed_at ? new Date(metar.observed_at) : null;
  const time = at && !Number.isNaN(at.getTime()) ? zuluTime(at) : null;
  return [ceiling, wind, time].filter(Boolean).join(" · ");
}
