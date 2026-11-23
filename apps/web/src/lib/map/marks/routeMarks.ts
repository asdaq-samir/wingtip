import type { ExpressionSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { inkOn } from "../../scoreScale";
import { CHART, MAP_LABEL } from "../../tokens";
import { badgeLayer, chipLayer, pictureLayer, type Layout } from "../gl/markLayers";
import type { GlSymbol } from "../gl/useGlSymbols";
import { ROUTE_PILL, ROUTE_POINT_PILL, dotPicture, fieldMarkPicture, turnDotPicture } from "./markPictures";
import { outsideOfTurn, turnSide } from "./routeTurns";
import type { AirspaceClass } from "../../preferences";

/**
 * The route's own marks: its departure, stops and destination as
 * ForeFlight marks a route's fields (the owner's screenshot of its
 * selected course, 2026-11-08) -- the field's mark as every airport on
 * the chart wears it, its ident beside it in white bold on a dark pill,
 * which says this one is the route's -- a waypoint or present position
 * the route turns at as a small ringed dot exactly on the point, its name
 * on a pill beside it outside the turn (the owner's option A, 2026-11-14:
 * the pill on the point hid the turn and own ship; routeTurns), and the
 * chosen checkpoints as numbered dots, the nav log's numbers on them.
 *
 * They give way to each other by priority, as the iPhone's map gives way
 * (the FPL audit's A12, 2026-11-08: "TOC" under badge 1, KDLH's ident
 * under the TOD and TOC pills): MapLibre's collision places the
 * destination's ident first, the route's other fields next, then the
 * checkpoints in flight order (the earlier of two that meet kept), and
 * the tops of climb and descent last (LegPointsGl, a layer under these);
 * a field's mark and a turn's dot themselves stay wherever they are,
 * under the names, and keep the labels placed after them off them.
 */

export const ROUTE_MARKS = "route-marks";

const KIND = (kind: string) => ["==", ["get", "kind"], kind] as ExpressionSpecification;
const SORT = { collide: true as const, sort: ["get", "sort"] as ExpressionSpecification };
/** A route field's ident's size (map.label.kind.route-ident), for its offset in ems. */
const ROUTE_IDENT_SIZE = MAP_LABEL.kind.routeIdent.size;
/** How far a route field's ident is from the field's middle, in its ems:
 *  20 points beside it, past the 26-point mark and the pill's 5 of edge;
 *  16 over or under it, past the mark and the pill's 3. */
const AWAY = 20 / ROUTE_IDENT_SIZE;
const AWAY_UP = 16 / ROUTE_IDENT_SIZE;

/** Each side a route field's ident can take: its anchor (its side facing
 *  the field) and its offset. */
const SIDE: Record<FieldSide, [string, [number, number]]> = {
  left: ["left", [AWAY, 0]],
  bottom: ["bottom", [0, -AWAY_UP]],
  right: ["right", [-AWAY, 0]],
  top: ["top", [0, AWAY_UP]],
};
type FieldSide = "left" | "bottom" | "right" | "top";
/** Clockwise from east (the pill right of the field), the order the sides
 *  are tried in from the first. */
const CLOCKWISE: FieldSide[] = ["left", "top", "right", "bottom"];

/** The sides in the order MapLibre tries them, the side outside the turn
 *  first (the feature's `out`, degrees clockwise from north, as the screen
 *  shows it with the map turned to `bearing`; fieldSide), then its
 *  neighbours, the opposite last. Worked out north-up alone, with the map
 *  track up in flight the side outside the turn could lie on the leg again
 *  (the r5-ui audit's L14, 2026-11-23); RouteGl sets it again as the map
 *  turns (useTurnedNames), as the route points' names are. */
export function fieldSides(bearing: number): Pick<Layout, "text-variable-anchor-offset"> {
  const turned = ["%", ["+", ["get", "out"], 720 - Math.round(bearing)], 360];
  const quarter = ["%", ["round", ["/", turned, 90]], 4];
  const order = (first: FieldSide) => {
    const i = CLOCKWISE.indexOf(first);
    return ["literal", [0, 1, 3, 2].flatMap((k) => SIDE[CLOCKWISE[(i + k) % 4]!])];
  };
  return {
    "text-variable-anchor-offset": [
      "match",
      quarter,
      ...[0, 1, 2, 3].flatMap((q) => [q, order(fieldSide(q * 90))]),
      ["literal", CLOCKWISE.flatMap((k) => SIDE[k])],
    ] as unknown as Layout["text-variable-anchor-offset"],
  };
}

/** The side of a field its ident goes first: outside the course's turn
 *  there (outsideOfTurn, degrees clockwise from up on a north-up screen)
 *  to the nearest of four. */
export function fieldSide(outDeg: number): FieldSide {
  return (["bottom", "left", "top", "right"] as const)[Math.round((((outDeg % 360) + 360) % 360) / 90) % 4]!;
}

/** Bottom to top: the layers above are placed first. */
export const ROUTE_MARK_LAYERS: SymbolLayerSpecification[] = [
  { ...badgeLayer("route-checkpoints", ROUTE_MARKS, SORT), filter: KIND("checkpoint") },
  // The dot on the point and the field's mark, always drawn and under the
  // route's names, which are placed before them (a name's pill reaches
  // within the mark's box, which would push it off its own field): the
  // marks keep their room from the chart's labels and the other marks
  // placed after them, so none is drawn half under one.
  { ...pictureLayer("route-fix-dots", ROUTE_MARKS, { room: true }), filter: KIND("fix") },
  { ...pictureLayer("route-field-marks", ROUTE_MARKS, { room: true }), filter: KIND("field") },
  { ...chipLayer("route-fixes", ROUTE_MARKS, SORT, { "icon-image": ROUTE_POINT_PILL.id, ...turnSide(0) }), filter: KIND("fix") },
  {
    // The ident 15 points from the field's middle, past its mark, on its
    // pill, first on the side outside the course's turn there (`side`),
    // off the line: east of the field it lay along the leg west of it and
    // hid it (the owner's screenshot, KAHQ's over the leg from KUGN). Where that side is taken
    // (a stop's pin, own ship, another of the route's fields), the left,
    // then over and under the mark, before it gives way: a destination
    // beside a fuel stop's pin kept its name (the owner's iPhone
    // screenshot, 2026-11-23: KLAS under KPGA's pin at the country's zoom).
    ...chipLayer(
      "route-field-idents",
      ROUTE_MARKS,
      SORT,
      { "icon-image": ROUTE_PILL.id, ...fieldSides(0) },
      { "text-color": CHART.casing },
      "routeIdent",
    ),
    filter: KIND("field"),
  },
];

/** The route points' names, whose side RouteGl turns with the map
 *  (turnSide). */
export const ROUTE_FIX_NAMES = "route-fixes";
/** The route fields' idents, whose sides RouteGl turns with the map
 *  (fieldSides). */
export const ROUTE_FIELD_IDENTS = "route-field-idents";

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
 *  layers above draw them; `line` the course's [lat, lon] points, which
 *  side of each turn is outside, and `ring` the course's colour. */
export function routeMarks(
  endpoints: Endpoint[],
  checkpoints: Checkpoint[],
  line: [number, number][] = [],
  ring: string = CHART.course,
): GlSymbol[] {
  return [
    ...endpoints.map((e, i): GlSymbol => ({
      key: e.ident,
      lat: e.lat,
      lon: e.lon,
      text: e.ident,
      picture: e.fix ? turnDotPicture(ring) : fieldMarkPicture(e.space, e.colour),
      also: e.fix ? [ROUTE_POINT_PILL] : [ROUTE_PILL],
      // The destination's placed before every other.
      props: { kind: e.fix ? "fix" : "field", sort: i === endpoints.length - 1 ? 0 : 1, out: outsideOfTurn(line, e) },
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
