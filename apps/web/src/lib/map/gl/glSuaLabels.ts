import type { SymbolLayerSpecification } from "maplibre-gl";
import { CHART } from "../../tokens";
import type { Stretch } from "./drawSvg";
import { AIRSPACE_LABELS_FROM, OVERLAY_SOURCE, SUA_INK, TAB_BOX, glZoom } from "./glStyle";
import { labelText } from "./layers/common";

/**
 * The special-use areas' tabs, as ForeFlight writes them on a MOA's or a
 * restricted area's boundary over the sectional (the owner's screenshot
 * near Brady, TX, 2026-11-12): a dark tab bordered in the area's ink,
 * white bold type, its name and its altitudes on two lines,
 * "M-BRADY NOR*:" over "3600-17999", the long side along the line and
 * just inside the area, turned to read down a north-south side. The Class
 * B, C and D tabs' look (glStyle's airspaceLayers), from the same zoom.
 */

/** The FAA's TYPE_CODEs drawn in the restricted ink (glStyle's SUA_INK):
 *  prohibited, restricted, warning and danger areas; MOAs and alert areas
 *  are magenta. */
const RESTRICTED = ["P", "R", "W", "D"];
const restricted = ["in", ["get", "type"], ["literal", RESTRICTED]];

/** A tab's picture by ink: its id, for the label layer's icon-image. */
export const suaTab = (ink: keyof typeof SUA_INK) => `sua|tab|${ink}`;

/** The tabs' pictures, as the airspace's (glOverlays' AIRSPACE_TAB_PICTURES):
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

/** How far off its point a tab sits, ems towards the area's side: about
 *  half its two lines' height (at the tabs' line height of 1, TAB_BOX),
 *  so its edge meets the line. */
const INSIDE_EM = 1.2;

/** The tabs' one layer, from the tiles' `special_use_labels` (the charts
 *  job's points, one an area on its longest side): `tab` the engine's
 *  words for it (special_use_tab's `text`, "M-BRNWD 2 W*:" over
 *  "7000-17999"), so the map only draws them, `angle` its turn and
 *  `side` where the area lies. */
export function specialUseLabelLayer(font: string[]): SymbolLayerSpecification {
  return {
    id: "sua-labels",
    type: "symbol",
    source: OVERLAY_SOURCE,
    "source-layer": "special_use_labels",
    minzoom: glZoom(AIRSPACE_LABELS_FROM),
    layout: {
      ...suaTabLayout(font),
      "text-field": ["get", "tab"],
      // Along the side where it sits, upright on a north-up chart, and
      // turned with the chart when the pilot turns the map, as the
      // sectional's own printed tabs are (the Class tabs' look).
      "text-rotate": ["get", "angle"],
      "icon-rotate": ["get", "angle"],
      "text-rotation-alignment": "map",
      "icon-rotation-alignment": "map",
      // Offset in the text's own turned frame: below it where `side` is
      // 1, above where it is -1.
      "text-offset": ["case", ["==", ["get", "side"], 1], ["literal", [0, INSIDE_EM]], ["literal", [0, -INSIDE_EM]]] as never,
    },
    paint: { "text-color": CHART.casing },
  };
}

/** A tab's look, its text and picture: the chart's tabs and the 3D
 *  view's (features/plan-map/terrain/AirspaceVolumesGl). */
export function suaTabLayout(font: string[]) {
  return {
    // The Class B, C and D tabs' size and box (map.label.kind.airspace-tab,
    // TAB_BOX): they grew to 13 close in, in a roomier tab, so one kind of
    // tab was lettered two ways side by side.
    "text-font": font,
    "text-size": labelText("airspaceTab")["text-size"],
    ...TAB_BOX,
    "icon-image": ["case", restricted, suaTab("restricted"), suaTab("moa")] as never,
    "text-allow-overlap": false,
    "icon-allow-overlap": false,
    // A restricted area's tab before a MOA's it lies in, as its line is
    // drawn over the MOA's (specialUseLayers).
    "symbol-sort-key": ["case", restricted, 0, 1] as never,
  };
}
