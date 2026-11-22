import type { ExpressionSpecification } from "maplibre-gl";
import { callEngine, type EngineAnswer } from "../../../lib/engine/engine";
import { M_PER_FT } from "../../../lib/geo";
import type { HazardSetting } from "../../../lib/preferences";
import { CHART } from "../../../lib/tokens";

export type HazardView = EngineAnswer<"hazard_view">;

/** What the map's hazard colouring draws (the engine's hazard_view): the
 *  altitude, the GPS's in flight and the plan's cruise on the ground, the
 *  pilot's clearance and the red and yellow lines under it, and each of
 *  `tops` (obstacle tops, ft MSL) against them. The rules are the
 *  engine's (engine/crates/altitude/src/altitude/hazard.rs, where the
 *  figures and their 14 CFR sources are); nothing is compared here. */
export function hazardView(
  setting: HazardSetting,
  fix: { speedKt: number | null; altitudeFt: number | null } | null,
  plannedFt: number | null,
  clearanceFt: number | null,
  tops: number[] = [],
): HazardView {
  return callEngine("hazard_view", {
    setting,
    speed_kt: fix?.speedKt ?? null,
    gps_altitude_ft: fix?.altitudeFt ?? null,
    planned_altitude_ft: plannedFt,
    clearance_ft: clearanceFt,
    tops_ft: tops,
  });
}

// The chart's caution and warning, half and three fifths strong (an
// 8-digit hex's alpha), so the chart's words read through them.
const AMBER = `${CHART.caution}80`;
const RED = `${CHART.warning}99`;
const CLEAR = "transparent";

/**
 * The colours of a color-relief layer on the terrain tiles for the
 * engine's lines, feet MSL: clear under the yellow, amber from it, red
 * over the red. How it is drawn is this app's: MapLibre's color-relief
 * takes only an interpolate on `elevation` with literal stops, so the
 * colours step a metre wide rather than fade (as the pilot's view's,
 * svColours).
 */
export function hazardColours(view: Pick<HazardView, "warning_from_ft" | "caution_from_ft">): ExpressionSpecification {
  const caution = (view.caution_from_ft ?? 0) * M_PER_FT,
    warning = (view.warning_from_ft ?? 0) * M_PER_FT;
  return [
    "interpolate",
    ["linear"],
    ["elevation"],
    Math.min(-500, caution - 2),
    CLEAR,
    caution - 1,
    CLEAR,
    caution,
    AMBER,
    warning,
    AMBER,
    warning + 1,
    RED,
    Math.max(9000, warning + 2),
    RED,
  ];
}

/** An obstacle's colour by the engine's level for it; null, none shown. */
export const LEVEL_COLOUR = { warning: CHART.warning, caution: CHART.caution } as const;
