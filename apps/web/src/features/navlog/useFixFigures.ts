import { useMemo } from "react";
import type { StripFigure } from "../../components/FigureStrip";
import { nearVariation } from "../../lib/magnetic";
import { underway } from "../../lib/map/position/glide";
import { useOwnShip, type Fix } from "../../lib/map/position/ownShip";
import { gpsFigure } from "./gpsFigure";
import { trackFigure } from "./trackFigure";

/** The engine's WMM variation at a point today (`magnetic_variation`),
 *  asked again only a mile on or on a new day (lib/magnetic nearVariation). */
const variation = nearVariation();

/** The strip's two figures from the fix: its GPS altitude (gpsFigure) and
 *  its magnetic track (trackFigure), exactly as each is written. */
function fixFigures(fix: Fix | null, plannedCourseDeg: number | null): { gps: StripFigure | null; track: StripFigure } {
  return { gps: gpsFigure(fix), track: trackFigure(fix, underway(fix), variation, plannedCourseDeg) };
}

/**
 * The strip's GPS altitude and track (TripFigures), drawn again only as
 * one of them changes as written -- ten feet, a degree -- not at every
 * fix: a phone's GPS answers about once a second, each fix a few feet and
 * a fraction of a degree off the last, and the whole strip with its
 * figures was drawn again at each one for three hours of flight. The
 * figures are worked out from each fix as before (the selector), and
 * compared by what they say.
 */
export function useFixFigures(plannedCourseDeg: number | null = null): { gps: StripFigure | null; track: StripFigure } {
  const said = useOwnShip((s) => JSON.stringify(fixFigures(s.enabled ? s.fix : null, plannedCourseDeg)));
  return useMemo(() => JSON.parse(said) as ReturnType<typeof fixFigures>, [said]);
}
