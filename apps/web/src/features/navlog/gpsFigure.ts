import { grouped } from "../../lib/format";
import type { StripFigure } from "../../components/FigureStrip";

/**
 * The airplane's GPS altitude as the strip's last figure, whenever its
 * position is known -- on the ground, in a dry run and in flight -- the way
 * a flight app shows "GPS ALT" (the owner, 2026-11-20: "The figures don't
 * show gps altitude"; it had been in flight and a dry run alone).
 *
 * What the figure is: the fix's altitudeFt (lib/map/position/ownShip),
 * the browser's `coords.altitude` turned to feet through the units module
 * (lib/geo's M_PER_FT). The W3C Geolocation API, section 9.2: "The
 * altitude attribute denotes the height of the position, specified in
 * meters above the WGS84 ellipsoid" -- a height above the ellipsoid, not
 * MSL, which differs from it by the geoid's height (tens of metres over the
 * US), though some browsers pass on the device's own MSL figure. A dry
 * run's simulated fix carries the plan's altitude on its track instead.
 * So it is named "GPS alt", never "MSL" or an altimeter's figure: the
 * altimeter is what altitudes are flown and assigned by (14 CFR 91.121).
 * To the nearest 10 ft, since a GPS height wanders by tens of feet.
 *
 * Null with no position (the strip keeps its four columns); "—" with a
 * position that gives no altitude (a desktop's Wi-Fi fix, a dry run's
 * point without one).
 */
export function gpsFigure(fix: { altitudeFt: number | null } | null): StripFigure | null {
  if (!fix) return null;
  const ft = fix.altitudeFt == null || Number.isNaN(fix.altitudeFt) ? null : Math.round(fix.altitudeFt / 10) * 10;
  return ft === null
    ? { name: "GPS", label: "GPS alt", value: "—", testId: "strip-gps-alt", said: "GPS altitude: none from this position" }
    : { name: "GPS", label: "GPS alt", value: grouped(ft), unit: "ft", testId: "strip-gps-alt", said: `GPS altitude, ${grouped(ft)} feet` };
}
