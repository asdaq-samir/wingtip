import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { inkOn } from "../../scoreScale";
import { CHART } from "../../tokens";
import { badgeLayer, chipLayer, pictureLayer } from "../gl/markLayers";
import type { GlSymbol } from "../gl/useGlSymbols";
import { FIX_PILL, FIX_PILL_SHIFT, ROUTE_PILL, dotPicture, fieldMarkPicture } from "./markPictures";
import type { AirspaceClass } from "../../preferences";

/**
 * The route's own marks: its departure, stops and destination as
 * ForeFlight marks a route's fields (the owner's screenshot of its
 * selected course, 2026-11-08) -- the field's mark as every airport on
 * the chart wears it, its ident beside it in white bold on a dark pill,
 * which says this one is the route's -- a waypoint flown through as the
 * chart's magenta fix on a pill, and the chosen checkpoints as numbered
 * dots, the nav log's numbers on them.
 *
 * They give way to each other by priority, as the iPhone's map gives way
 * (the FPL audit's A12, 2026-11-08: "TOC" under badge 1, KDLH's ident
 * under the TOD and TOC pills): MapLibre's collision places the
 * destination's ident first, the route's other fields next, then the
 * checkpoints in flight order (the earlier of two that meet kept), and
 * the tops of climb and descent last (LegPointsGl, a layer under these);
 * a field's mark itself stays wherever it is.
 */

export const ROUTE_MARKS = "route-marks";

const KIND = (kind: string) => ["==", ["get", "kind"], kind] as ExpressionSpecification;
const SORT = { collide: true as const, sort: ["get", "sort"] as ExpressionSpecification };

/** Bottom to top: the layers above are placed first. */
export const ROUTE_MARK_LAYERS: SymbolLayerSpecification[] = [
  { ...badgeLayer("route-checkpoints", ROUTE_MARKS, SORT), filter: KIND("checkpoint") },
  { ...chipLayer("route-fixes", ROUTE_MARKS, SORT, { "text-offset": [FIX_PILL_SHIFT, 0] }), filter: KIND("fix") },
  {
    // The ident 15 points right of the field's middle, past its mark, on
    // its pill: 5 points in from the pill's left.
    ...chipLayer(
      "route-field-idents",
      ROUTE_MARKS,
      SORT,
      { "icon-image": ROUTE_PILL.id, "text-size": 12, "text-anchor": "left", "text-offset": [20 / 12, 0] },
      { "text-color": CHART.casing },
    ),
    filter: KIND("field"),
  },
  { ...pictureLayer("route-field-marks", ROUTE_MARKS), filter: KIND("field") },
];

/** The lowest of the route's own layers, which the tops of climb and
 *  descent are drawn under, to give way to all of them. */
export const ROUTE_MARKS_LOWEST = ROUTE_MARK_LAYERS[0]!.id;

interface Endpoint {
  ident: string;
  lat: number;
  lon: number;
  colour: string;
  space: AirspaceClass | null;
  fix: boolean;
  select: () => void;
}

interface Checkpoint {
  key: string;
  lat: number;
  lon: number;
  number: number;
  colour: string;
  onTap: () => void;
}

/** The route's fields (the destination last) and its checkpoints, as the
 *  layers above draw them. */
export function routeMarks(endpoints: Endpoint[], checkpoints: Checkpoint[]): GlSymbol[] {
  return [
    ...endpoints.map((e, i): GlSymbol => ({
      key: e.ident,
      lat: e.lat,
      lon: e.lon,
      text: e.ident,
      picture: e.fix ? FIX_PILL : fieldMarkPicture(e.space, e.colour),
      also: e.fix ? [] : [ROUTE_PILL],
      // The destination's placed before every other.
      props: { kind: e.fix ? "fix" : "field", sort: i === endpoints.length - 1 ? 0 : 1 },
      onTap: e.select,
    })),
    ...checkpoints.map((c): GlSymbol => ({
      key: `cp-${c.key}`,
      lat: c.lat,
      lon: c.lon,
      text: String(c.number),
      picture: dotPicture(c.colour),
      props: { kind: "checkpoint", sort: c.number, ink: inkOn(c.colour) },
      onTap: c.onTap,
    })),
  ];
}
