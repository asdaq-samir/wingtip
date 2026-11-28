import { useOwnShip } from "../../../lib/map/position/ownShip";
import { usePreferences } from "../../../lib/preferences";
import { hazardView, type HazardView } from "./hazard";

/**
 * The map's hazard colouring now (the engine's hazard_view), from the
 * Map card's setting and clearance, own ship's GPS fix and the plan's
 * cruise. The GPS height goes as read: the engine steps it down to the
 * 50 ft below itself (GPS_STEP_FT), so a height wandering a few feet
 * gives the same lines, and HazardGl's effects, keyed on them, do not
 * paint the map again at every fix.
 */
export function useHazardView(cruiseFt: number | null): HazardView | null {
  const setting = usePreferences((s) => s.hazard);
  const clearance = usePreferences((s) => s.hazardClearanceFt);
  // The speed to the knot (the engine reads it only as underway or not),
  // so a fix a second is no new answer at a steady speed.
  const speedKt = useOwnShip((s) => (s.enabled && s.fix && s.fix.speedKt != null ? Math.round(s.fix.speedKt) : null));
  const gpsFt = useOwnShip((s) => (s.enabled && s.fix ? s.fix.altitudeFt : null));
  if (setting === "off") return null;
  return hazardView(setting, { speedKt, altitudeFt: gpsFt }, cruiseFt, clearance);
}
