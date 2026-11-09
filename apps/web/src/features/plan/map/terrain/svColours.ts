import type { ExpressionSpecification } from "maplibre-gl";
import { callEngine } from "../../../../lib/engine/engine";
import { M_PER_FT } from "./geometry";

export const SV_AMBER = "rgba(255, 176, 0, 0.75)";
export const SV_RED = "rgba(215, 0, 21, 0.8)";
const CLEAR = "rgba(0, 0, 0, 0)";

/**
 * The pilot's-eye view's colours for the ground (a color-relief layer on
 * the terrain tiles) under an airplane at `altFt` MSL: clear below the
 * engine's amber band, amber from it, red from the red one
 * (`terrain_view_bands`, engine/crates/route/src/motion/terrain_view.rs,
 * where the figures and their sources are). How it is drawn is this
 * app's: the colours, and the band's edges a metre wide -- MapLibre's
 * color-relief takes only an interpolate on `elevation` with literal
 * labels, so the colours step there rather than fade.
 */
export function svColours(altFt: number): ExpressionSpecification {
  const bands = callEngine("terrain_view_bands", { altitude_ft: altFt });
  const floor = bands.caution_from_ft * M_PER_FT, top = bands.warning_from_ft * M_PER_FT;
  return [
    "interpolate", ["linear"], ["elevation"],
    Math.min(-500, floor - 2), CLEAR,
    floor - 1, CLEAR,
    floor, SV_AMBER,
    top - 1, SV_AMBER,
    top, SV_RED,
    Math.max(9000, top + 1), SV_RED,
  ];
}
