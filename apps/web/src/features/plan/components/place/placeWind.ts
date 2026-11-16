import { reportedWind } from "../../format";

/** A report's wind as the airport card writes it everywhere in it, the
 *  hour-by-hour row's form with its unit: "250°T 3 kt", "VRB 4 kt",
 *  "240°T 12G20 kt", "Calm"; "Not reported" with no speed. True, as METAR
 *  winds are (FAA JO 7900.5), so it is never read against a runway's
 *  magnetic number by mistake. The card wrote "250° at 3 kt" under
 *  Observed over the row's "250°T 3" (the web audit's WEB-44). */
export function placeWind(metar: {
  wind_speed_kt?: number | null;
  wind_dir_true_deg?: number | null;
  wind_gust_kt?: number | null;
}): string {
  const wind = reportedWind(metar.wind_dir_true_deg, metar.wind_speed_kt, metar.wind_gust_kt);
  if (!wind) return "Not reported";
  return wind === "calm" ? "Calm" : `${wind.dir} ${wind.speed} kt`;
}
