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
  // Alaska's AIRMETs (the planner's "airmets"), in the SIGMET file's codes.
  "SFC WND": WEATHER.wind,
  LLWS: WEATHER.shear,
  "Low-level wind shear": WEATHER.shear,
  "Strong surface winds": WEATHER.wind,
  ASH: WEATHER.ash,
};

export function areaColour(area: Pick<WeatherArea, "kind" | "hazard">): string {
  if (area.kind === "convective") return AREA_COLOURS.convective!;
  return AREA_COLOURS[area.hazard ?? ""] ?? WEATHER.other;
}

/** A hazard's colour as words on the map's white halo: its own, but
 *  turbulence's amber, 3.2:1 on white, deepened to 5:1
 *  (color.weather.turbulence-text), as a category's chip deepens LIFR
 *  (CATEGORY_CHIP): every other hazard's is 4.5:1 or more already. */
export function hazardTextInk(colour: string): string {
  return colour === WEATHER.turbulence ? WEATHER.turbulenceText : colour;
}
