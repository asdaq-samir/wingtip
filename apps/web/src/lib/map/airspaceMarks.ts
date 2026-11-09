/** A line's look: its ink, width and dash (the card's swatch). */
export interface LineLook { color: string; weight: number; dashArray?: string }
import type { AirspaceVolume } from "./overlayTypes";
import { CHART } from "../tokens";

type Class = AirspaceVolume["airspace_class"];

/** The airspace lines' own inks, as ForeFlight draws its Class B and C
 *  over the same sectional (the owner's screenshot, 2026-10-30): a light
 *  sky blue and a clear magenta, which stand off the chart's darker
 *  printed blue they lie on, where a line in that blue sank into it. */
const AIRSPACE_BLUE = CHART.airspaceBlue;
const AIRSPACE_MAGENTA = CHART.airspaceMagenta;

/**
 * The airspace's lines as the sectional draws them (FAA Aeronautical
 * Chart User's Guide, VFR Terms and Symbols, Airspace): Class B a solid
 * blue line, Class C solid magenta, Class D dashed blue, as an airspace
 * card's swatch draws a length of them (AirspaceCard). A Class D's dash is a little longer
 * and its line whole and as heavy as a B's: at 2 px and .85 it was lost
 * in the chart's own dashed ring under it (the owner, 2026-10-29).
 */
export const AIRSPACE_LINE: Record<Class, LineLook> = {
  // ForeFlight's inks (above), a little heavier than the chart's own: in
  // the chart's blue the line sank into the printed ring under it
  // ("airspace blue is hard to see", the owner, 2026-10-30).
  B: { color: AIRSPACE_BLUE, weight: 3 },
  C: { color: AIRSPACE_MAGENTA, weight: 3 },
  D: { color: AIRSPACE_BLUE, weight: 3, dashArray: "10 5" },
};
