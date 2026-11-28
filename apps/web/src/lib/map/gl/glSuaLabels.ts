import { CHART } from "../../tokens";
import { OVERLAY_FRAGMENTS } from "../../generated/overlayLayers";
import type { Stretch } from "./drawSvg";
import { SUA_INK } from "./glStyle";

/**
 * The special-use areas' tabs, as ForeFlight writes them on a MOA's or a
 * restricted area's boundary over the sectional (the owner's screenshot
 * near Brady, TX, 2026-11-12): a dark tab bordered in the area's ink,
 * white bold type, its name and its altitudes on two lines. Their layer is
 * design/map-style.json's sua-labels; here their pictures, and their look
 * for the 3D view's tabs.
 */

/** A tab's picture by ink: its id, for the label layer's icon-image. */
export const suaTab = (ink: keyof typeof SUA_INK) => `sua|tab|${ink}`;

/** The tabs' pictures, as the airspace's (glOverlayPictures' AIRSPACE_TAB_PICTURES):
 *  a rounded box in the chart's tag ink, bordered in the area's,
 *  stretched to the text. */
export const SUA_TAB_PICTURES: [id: string, svg: () => string, stretch?: Stretch][] = (
  Object.keys(SUA_INK) as (keyof typeof SUA_INK)[]
).map((ink) => [
  suaTab(ink),
  () =>
    `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="0.75" y="0.75" width="10.5" height="10.5" rx="2" fill="${CHART.tag}" fill-opacity="0.92" stroke="${SUA_INK[ink]}" stroke-width="1.5"/></svg>`,
  { inset: 4 },
]);

/** A tab's look, its text and picture, in `font`: the chart's tabs'
 *  (design/map-style.json's suaTab) and the 3D view's
 *  (features/plan-map/terrain/AirspaceVolumesGl). */
export function suaTabLayout(font: string[]) {
  return { ...OVERLAY_FRAGMENTS.suaTab, "text-font": font };
}
