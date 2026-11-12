import type { WeatherArea } from "../api/types";
import { WEATHER } from "../tokens";

/** Each area's colour by what it warns of, as aviationweather.gov's own
 *  map tells them apart: convective red-orange, icing blue, turbulence
 *  amber, IFR and mountains obscured violet and stone, the winds teal. */
const AREA_COLOURS: Record<string, string> = {
  convective: WEATHER.convective,
  Icing: WEATHER.icing,
  ICE: WEATHER.icing,
  Turbulence: WEATHER.turbulence,
  TURB: WEATHER.turbulence,
  "IFR conditions": WEATHER.ifr,
  IFR: WEATHER.ifr,
  "Mountains obscured": WEATHER.mountains,
  "MTN OBSCN": WEATHER.mountains,
  "Low-level wind shear": WEATHER.shear,
  "Strong surface winds": WEATHER.wind,
  ASH: WEATHER.ash,
};

export function areaColour(area: Pick<WeatherArea, "kind" | "hazard">): string {
  if (area.kind === "convective") return AREA_COLOURS.convective!;
  return AREA_COLOURS[area.hazard ?? ""] ?? WEATHER.other;
}
