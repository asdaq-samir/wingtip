import { usePreferences } from "../../../../lib/preferences";
import { DRY_RUN, usePastFlight } from "../pastFlight";
import { usePilotView } from "./pilotView";

/** How the ground is drawn: its relief shaded over the chart, always in
 *  2D (the owner, 2026-11-13, Flat taken out of the settings), or stood up
 *  in 3D. */
export type TerrainMode = "shaded" | "3d";

/**
 * The 3D view's state, in one place: the map's 3D button (ThreeDButton)
 * over the shaded chart, and the dry
 * run's pilot's-eye view, which is 3D whatever the menu says while the
 * dry run plays and is asked for. Light on purpose: the map's first
 * script reads it to know whether to load the 3D code (TerrainGl) at all.
 */
export function useTerrainView(): { mode: TerrainMode; pilot: boolean } {
  const threeD = usePreferences((s) => s.threeD);
  const dryRunning = usePastFlight((s) => s.hex === DRY_RUN);
  const pilot = usePilotView((s) => s.on) && dryRunning;
  return { mode: pilot || threeD ? "3d" : "shaded", pilot };
}
