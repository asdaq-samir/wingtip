import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { CHART } from "../../tokens";
import { GL_FONT, GL_FONT_BOLD, LABEL_HALO } from "./layers/common";

/**
 * The symbol layers the app's own marks are drawn with (useGlSymbols):
 * each feature's picture is its `icon`, its words its `text`. A mark
 * that keeps its place whatever is near it overlaps freely; one that gives way
 * (`collide`) is placed by MapLibre's collision in its sort key's order,
 * lowest first, the layers above placed before those under them.
 */

export type Layout = NonNullable<SymbolLayerSpecification["layout"]>;
type Paint = NonNullable<SymbolLayerSpecification["paint"]>;

const ICON = ["get", "icon"] as ExpressionSpecification;
const TEXT = ["get", "text"] as ExpressionSpecification;

/** Shown wherever it falls, over whatever is there, and taking no room
 *  from the marks that give way: as the marks drawn as HTML were, which
 *  MapLibre's collision did not see. */
const STAYS: Layout = {
  "icon-allow-overlap": true,
  "text-allow-overlap": true,
  "icon-ignore-placement": true,
  "text-ignore-placement": true,
};

/** How a mark gives way: kept by MapLibre's collision in `sort` order
 *  (lowest placed first), or kept wherever it falls. */
export type Giving = { collide: true; sort: ExpressionSpecification | number } | { collide?: false };

function giving(how: Giving): Layout {
  return how.collide ? { "symbol-sort-key": how.sort, "icon-padding": 0, "text-padding": 0 } : STAYS;
}

/** A picture alone (a pin, a field's mark, a barb), its point the
 *  picture's middle unless `layout` says. */
export function pictureLayer(id: string, source: string, how: Giving = {}, layout: Layout = {}): SymbolLayerSpecification {
  return { id, type: "symbol", source, layout: { "icon-image": ICON, ...giving(how), ...layout } };
}

/** A picture with its words beside it on the chart's white halo, as the
 *  chart letters a field: its ident in bold to the right of its mark. */
export function labelledLayer(
  id: string,
  source: string,
  how: Giving = {},
  layout: Layout = {},
  paint: Paint = {},
): SymbolLayerSpecification {
  return {
    id,
    type: "symbol",
    source,
    layout: {
      "icon-image": ICON,
      "text-field": TEXT,
      "text-font": GL_FONT_BOLD,
      "text-size": 11,
      "text-anchor": "left",
      // Just clear of a field's 26-point mark.
      "text-offset": [1.3, 0],
      ...giving(how),
      ...layout,
    },
    paint: { "text-color": CHART.fixInk, ...LABEL_HALO, ...paint },
  };
}

/** Words on a chip that stretches to fit them (icon-text-fit): a route
 *  field's ident on its dark pill, a top of climb's, a pattern's leg. */
export function chipLayer(
  id: string,
  source: string,
  how: Giving = {},
  layout: Layout = {},
  paint: Paint = {},
  bold = true,
): SymbolLayerSpecification {
  return {
    id,
    type: "symbol",
    source,
    layout: {
      "icon-image": ICON,
      "icon-text-fit": "both",
      "text-field": TEXT,
      "text-font": bold ? GL_FONT_BOLD : GL_FONT,
      "text-size": 11,
      ...giving(how),
      ...layout,
    },
    paint: { "text-color": CHART.fixInk, ...paint },
  };
}

/** Words drawn on a picture of a set size (a checkpoint's number on its
 *  dot): the picture keeps its size, the words at its middle. */
export function badgeLayer(id: string, source: string, how: Giving = {}, paint: Paint = {}): SymbolLayerSpecification {
  return {
    id,
    type: "symbol",
    source,
    layout: { "icon-image": ICON, "text-field": TEXT, "text-font": GL_FONT_BOLD, "text-size": 11, ...giving(how) },
    paint: { "text-color": ["get", "ink"] as ExpressionSpecification, ...paint },
  };
}
