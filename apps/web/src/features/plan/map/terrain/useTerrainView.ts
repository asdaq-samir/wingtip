import { usePreferences } from "../../../../lib/preferences";
import { DRY_RUN, usePastFlight } from "../pastFlight";
import { usePilotView } from "./pilotView";

/** How the ground is drawn: not at all, its relief shaded over the chart,
 *  or stood up in 3D. */
export type TerrainMode = "flat" | "shaded" | "3d";

/**
 * The 3D view's state, in one place: the Map Settings' Terrain under the
 * map's 3D button (ThreeDButton), and the dry
 * run's pilot's-eye view, which is 3D whatever the menu says while the
 * dry run plays and is asked for. Light on purpose: the map's first
 * script reads it to know whether to load the 3D code (TerrainGl) at all.
 */
export function useTerrainView(): { mode: TerrainMode; pilot: boolean } {
  const terrain = usePreferences((s) => s.terrain);
  const threeD = usePreferences((s) => s.threeD);
  const dryRunning = usePastFlight((s) => s.hex === DRY_RUN);
  const pilot = usePilotView((s) => s.on) && dryRunning;
  return { mode: pilot || threeD ? "3d" : terrain, pilot };
}
