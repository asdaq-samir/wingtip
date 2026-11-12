import type { SymbolLayerSpecification } from "maplibre-gl";
import { CHART } from "../../tokens";
import type { Stretch } from "./glLayer";
import { AIRSPACE_LABELS_FROM, OVERLAY_SOURCE, SUA_INK, glZoom } from "./glStyle";

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

/** "M-BRNWD 2 W*:" over "7000-17999": the engine's words for the tab
 *  (special_use_tab's `text`), which the charts job writes into the
 *  tiles, so the map only draws them; the name alone in an archive
 *  written before the tiles carried them (vector_tiles.VERSION 5). */
const TAB_TEXT = ["coalesce", ["get", "tab"], ["get", "label"]];

/** How far off its point a tab sits, ems towards the area's side: about
 *  half its two lines' height, so its edge meets the line. */
const INSIDE_EM = 1.35;

/** The tabs' one layer. From the tiles' `special_use_labels` (the charts
 *  job's points, one an area on its longest side, `tab` its words, `angle`
 *  its turn and `side` where the area lies); or where an older archive has none of
 *  them, the area's name alone along its `special_use` boundary: that
 *  layer's floor is 0 for a floor the FAA gives above the ground (Brady
 *  Low's 500 ft) and keeps no "to but not including", so its figures are
 *  not written. */
export function specialUseLabelLayer(font: string[], labelPoints = true): SymbolLayerSpecification {
  const tab = suaTabLayout(font);
  const common = {
    id: "sua-labels",
    type: "symbol" as const,
    source: OVERLAY_SOURCE,
    minzoom: glZoom(AIRSPACE_LABELS_FROM),
    paint: { "text-color": CHART.casing },
  };
  if (!labelPoints)
    return {
      ...common,
      "source-layer": "special_use",
      layout: {
        ...tab,
        "text-field": ["get", "name"],
        "symbol-placement": "line",
        "symbol-spacing": 480,
        "text-rotation-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "text-keep-upright": true,
        "text-max-angle": 30,
      },
    };
  return {
    ...common,
    "source-layer": "special_use_labels",
    layout: {
      ...tab,
      "text-field": TAB_TEXT as never,
      // Along the side where it sits, upright already; the map never
      // turns (GlMapShell), so the chart's north is the screen's.
      "text-rotate": ["get", "angle"],
      "icon-rotate": ["get", "angle"],
      "text-rotation-alignment": "map",
      "icon-rotation-alignment": "map",
      // Offset in the text's own turned frame: below it where `side` is
      // 1, above where it is -1.
      "text-offset": ["case", ["==", ["get", "side"], 1], ["literal", [0, INSIDE_EM]], ["literal", [0, -INSIDE_EM]]] as never,
    },
  };
}

/** A tab's look, its text and picture: the chart's tabs and the 3D
 *  view's (features/plan/map/terrain/AirspaceVolumesGl). */
export function suaTabLayout(font: string[]) {
  return {
    "text-font": font,
    "text-size": ["interpolate", ["linear"], ["zoom"], glZoom(8), 11, glZoom(12), 13] as never,
    "text-line-height": 1.15,
    "icon-image": ["case", restricted, suaTab("restricted"), suaTab("moa")] as never,
    "icon-text-fit": "both" as const,
    "icon-text-fit-padding": [2, 6, 2, 6] as [number, number, number, number],
    "text-padding": 4,
    "text-allow-overlap": false,
    "icon-allow-overlap": false,
    // A restricted area's tab before a MOA's it lies in, as its line is
    // drawn over the MOA's (specialUseLayers).
    "symbol-sort-key": ["case", restricted, 0, 1] as never,
  };
}
