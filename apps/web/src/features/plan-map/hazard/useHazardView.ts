import { useOwnShip } from "../../../lib/map/position/ownShip";
import { usePreferences } from "../../../lib/preferences";
import { hazardView, type HazardView } from "./hazard";

/** The altitude the colours are drawn from moves in steps of this, ft,
 *  so a GPS's height wandering a few feet does not paint the map again
 *  at every fix (as the pilot's view's 50 ft, PilotCamera). */
const STEP_FT = 50;

/**
 * The map's hazard colouring now (the engine's hazard_view), from the
 * Map card's setting and clearance, own ship's GPS fix and the plan's
 * cruise: read again only as what it answers changes, the height to
 * STEP_FT, so a fix a second is no new answer while level.
 */
export function useHazardView(cruiseFt: number | null): HazardView | null {
  const setting = usePreferences((s) => s.hazard);
  const clearance = usePreferences((s) => s.hazardClearanceFt);
  const speedKt = useOwnShip((s) => (s.enabled && s.fix ? s.fix.speedKt : null));
  const gpsFt = useOwnShip((s) => {
    const ft = s.enabled && s.fix ? s.fix.altitudeFt : null;
    return ft === null ? null : Math.round(ft / STEP_FT) * STEP_FT;
  });
  if (setting === "off") return null;
  return hazardView(setting, { speedKt, altitudeFt: gpsFt }, cruiseFt, clearance);
}
