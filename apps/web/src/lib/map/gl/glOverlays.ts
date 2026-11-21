import type { ExpressionSpecification, LayerSpecification, Map as MlMap, SourceSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { OverlayTiles } from "../../api/types";
import { usePreferences } from "../../preferences";
import { stationPictures } from "../marks/stationModel";
import {
  AIRPORT_IDENT_INK,
  AIRPORT_WEATHER,
  TILE_AIRPORT_ICON,
  airportIconSize,
  airportPictures,
} from "./airportIcons";
import { overlaySource } from "../sources/overlayTiles";
import { SLOTS, slotId, type Slot } from "./glLayer";
import { drawSvg, type DrawnImage } from "./drawSvg";
import { OVERLAY_SOURCE, SUA_LAYERS, airspaceLayers, glZoom, specialUseLayers } from "./glStyle";
import { GL_FONT_BOLD, LABEL_HALO, labelHalo, labelInk, labelText } from "./layers/common";
import { specialUseLabelLayer } from "./glSuaLabels";
import { OVERLAY_PICTURES } from "./glOverlayPictures";
import { CHART, MAP_ZOOM } from "../../tokens";

export { OVERLAY_SOURCE };

/** The chart's own ink for a fix's ident. */
const FIX_INK = CHART.fixInk;
/** A VFR waypoint's ident on the WebGL map: in the green of ForeFlight's
 *  triangle, at the owner's ask (2026-11-07, from its screenshots), where
 *  the sectional prints a magenta flag (Chart User's Guide, VFR
 *  waypoints); a step deeper for words, as the triangle's green on the
 *  white halo was 4.4:1, under the 4.5:1 small words need. */
const VFR_GREEN = CHART.vfrGreenText;

/**
 * The cycle's FAA overlays from its vector tiles (lib/map/sources/overlayTiles,
 * wingtip.vector_tiles), as the map's first style holds them (GlMapShell): the Class B, C and D, the airports, the VORs, the low
 * enroute chart's fixes, the VFR waypoints and the runways, each drawn
 * per tile as the chart is, with nothing asked of the planner for the
 * view and no wait on the engine. What changes over them -- which fields
 * the settings hide, the route's own fields, each field's weather -- is set on the layers here (applyOverlayFilters, setOverlayExclusion,
 * setAirportWeather); their taps and cards are the layers' components'
 * (AirportsGl, AirspaceGl, NavaidsGl), which build what a card needs from
 * the tapped feature's fields.
 */

// ---- The marks' pictures --------------------------------------------------

let drawn: Promise<Map<string, DrawnImage>> | null = null;
/** Every picture the overlay layers wear, drawn once a page at the
 *  screen's density, for the map to take in its missing-image resolver
 *  as a tile first asks for one (MapLibre waits on it, so no symbol is
 *  laid out without its picture). */
export function overlayPictures(): Promise<Map<string, DrawnImage>> {
  drawn ??= Promise.all([
    ...airportPictures().map((p) => p.draw().then((d) => [p.id, d] as const)),
    ...[...stationPictures(), ...OVERLAY_PICTURES].map(([id, svg, stretch]) => drawSvg(svg(), stretch).then((d) => [id, d] as const)),
  ]).then((all) => new Map(all.filter((e): e is readonly [string, DrawnImage] => !!e[1])));
  return drawn;
}

// ---- The layers -----------------------------------------------------------

/** The airports' zooms, in the app's levels (design/tokens.json's
 *  map.zoom): the farthest out any is drawn. Within it each field is in
 *  the tiles from its own tier's zoom (the charts job's AIRPORT_MIN_ZOOM
 *  reads the same tokens): towered, then the long hard runways, other
 *  public fields, private ones, heliports. */
const AIRPORTS_FARTHEST_ZOOM = MAP_ZOOM.airportsFarthest;
/** A field's ident beside its mark: out at a few states only a Class B's
 *  field's (the engine's field_mark_rank sizes it largest), as there an
 *  ident is wider than the room between two towered fields and took the
 *  place of the next one's mark (KSJC's of Fresno's); from
 *  map.zoom.airport-idents every field's. */
const AIRPORT_IDENT_FAR: ExpressionSpecification = [
  "step",
  ["zoom"],
  ["case", ["==", ["get", "size"], "largest"], ["get", "ident"], ""],
  glZoom(MAP_ZOOM.airportIdents),
  ["get", "ident"],
];

/** The airports' one symbol layer, from either source: the mark (airportIcons), its ident beside it in bold in the field's
 *  ink (the sectional sets an airport's name in its symbol's colour, Chart User's Guide, Airports), kept apart by MapLibre's
 *  collision in `rank` order, the engine's field_mark_rank: lowest placed first and winning, so a Class B's field
 *  (O'Hare), then a Class C's, then each tier by its longest hard runway. */
function airportMarksLayer(from: { source: string; "source-layer"?: string }): SymbolLayerSpecification {
  return {
    id: "airports",
    type: "symbol",
    ...from,
    minzoom: glZoom(AIRPORTS_FARTHEST_ZOOM),
    // The armed services' own fields and private ones unless asked for (a
    // joint-use field always drawn), and none the route draws itself: read
    // from the map's state, which the settings and the route set.
    filter: [
      "all",
      ["any", ["boolean", ["global-state", SHOW_MILITARY], false], ["!=", ["get", "military"], "military"]],
      ["any", ["boolean", ["global-state", SHOW_PRIVATE], false], ["!=", ["get", "use"], "private"]],
      notOwn(ROUTE_AIRPORTS),
    ],
    layout: {
      "icon-image": TILE_AIRPORT_ICON,
      // Each field at its own size step, the biggest largest (airportIconSize).
      "icon-size": airportIconSize(glZoom(AIRPORTS_FARTHEST_ZOOM), glZoom(10), glZoom(13)),
      "icon-allow-overlap": false,
      // Two px round each mark at every zoom: out at a few states the towered fields then stand side by side in rank
      // order, as ForeFlight's do, where 27 px round each (to the app's zoom 7) left one field a metro (2026-11-21).
      "icon-padding": 2,
      "symbol-sort-key": ["get", "rank"],
      "text-field": AIRPORT_IDENT_FAR,
      ...labelText("airportIdent"),
      "text-anchor": "left",
      "text-offset": [1.15, 0],
      // The ident gives way, the mark stays: a busy area keeps its fields.
      "text-optional": true,
      "text-padding": 1,
    },
    paint: { "text-color": labelInk(AIRPORT_IDENT_INK), ...labelHalo("airportIdent"), "text-opacity": SELECTED_HIDDEN },
  };
}

/** The mark, its ident beside it on whichever side is clear: MapLibre's
 *  variable anchor and collision, where a VOR's tag side was once
 *  picked by hand. A VOR's ident and frequency on its blue tag, "GCO
 *  (108.25)" as ForeFlight writes it; a fix's and a waypoint's bold, dark
 *  or green on a white halo. `kind` is the feature's ("vor", "fix",
 *  "vfr"), or the one kind every feature of a tile layer is. */
function navaidMarks(
  id: string,
  from: { source: string; "source-layer"?: string },
  kind: ExpressionSpecification | string = ["get", "kind"],
  extra: Partial<Pick<SymbolLayerSpecification, "filter" | "minzoom">> = {},
): SymbolLayerSpecification[] {
  return [
    {
      id,
      type: "symbol",
      ...from,
      ...extra,
      layout: {
        "icon-image": ["concat", "nav|", kind] as ExpressionSpecification,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    {
      id: `${id}-idents`,
      type: "symbol",
      ...from,
      ...extra,
      layout: {
        "text-field": ["case", ["has", "freq"], ["concat", ["get", "ident"], " (", ["get", "freq"], ")"], ["get", "ident"]],
        // A VOR's on its tag and a fix's on the halo, one size (map.label.kind's navaid-ident and fix-ident).
        ...labelText("fixIdent"),
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 1.1,
        "text-justify": "auto",
        "icon-image": ["case", ["==", kind, "vor"], "nav|tag", ""] as ExpressionSpecification,
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 4, 1, 4],
      },
      paint: {
        // A VOR's white on its tag stays white after dark (casing is no
        // day ink in map.label.night-ink); a fix's and a VFR waypoint's
        // turn light on the night's dark halo (labelInk).
        "text-color": labelInk(["match", kind, "vor", CHART.casing, "vfr", VFR_GREEN, FIX_INK] as ExpressionSpecification),
        "text-halo-color": ["match", kind, "vor", "transparent", LABEL_HALO["text-halo-color"]] as ExpressionSpecification,
        "text-halo-width": LABEL_HALO["text-halo-width"],
      },
    },
  ];
}

/** The navaids' zooms, in the app's levels: the VORs from a region's, the fixes
 *  and the VFR waypoints from 10 (NavaidCards, WaypointCard). */
const VOR_ZOOM = 8;
const FIX_ZOOM = 10;
/** The VORs a pilot tunes (wingtip.fixes.VOR_KINDS, NASR NAV_TYPE). */
const VOR_KINDS = ["VORTAC", "VOR/DME", "VOR"];

/** From MapLibre's 12, where the sectional has faded into the imagery
 *  (closeZoom): before it a runway is under a pixel or two wide and the
 *  chart's own airport symbol says more. */
const RUNWAYS_FROM = 12;

/** The runways' look, as ForeFlight draws them over its base map: a
 *  dark grey surface (a soft one lighter), a dashed white centreline, and
 *  each end's number in bold white on a dark halo, turned to read from
 *  the approach end (text-rotate is the end's true heading, so the
 *  number's top points down the runway, as it is painted). From NASR
 *  APT_RWY and APT_RWY_END: each runway's surveyed ends and width. */
function runwayLayers(): LayerSpecification[] {
  const from = { source: OVERLAY_SOURCE, "source-layer": "runways" };
  return [
    {
      id: "runway-surface",
      type: "fill",
      ...from,
      minzoom: RUNWAYS_FROM,
      filter: ["==", ["get", "part"], "surface"],
      paint: {
        "fill-color": ["case", ["get", "hard"], CHART.runwayHard, CHART.runwaySoft],
        "fill-outline-color": CHART.casing,
        "fill-opacity": 0.95,
      },
    },
    {
      id: "runway-centreline",
      type: "line",
      ...from,
      minzoom: RUNWAYS_FROM + 1,
      filter: ["==", ["get", "part"], "centreline"],
      paint: { "line-color": CHART.casing, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.75, 16, 2], "line-dasharray": [4, 3] },
    },
    {
      id: "runway-ends",
      type: "symbol",
      ...from,
      minzoom: RUNWAYS_FROM + 0.5,
      filter: ["==", ["get", "part"], "end"],
      layout: {
        "text-field": ["get", "end_id"],
        ...labelText("runwayNumber"),
        "text-rotation-alignment": "map",
        "text-rotate": ["get", "heading"],
        // Up the number's own page, which is down the runway from its end.
        "text-offset": [0, -1.1],
        "text-allow-overlap": true,
      },
      paint: { "text-color": CHART.casing, ...labelHalo("runwayNumber") },
    },
  ];
}

/** The ids of the layers each setting turns off (applyOverlayFilters). */
export const AIRSPACE_TILE_LAYERS = [
  ...["D", "C", "B"].flatMap((c) => [`airspace-${c}-band`, `airspace-${c}`]),
  "airspace-labels",
  ...SUA_LAYERS,
];
const NAVAID_TILE_LAYERS = ["navaids", "navaids-idents", "fixes", "fixes-idents"];
/** What the route's points alone leave out besides (lib/map/routeOnly):
 *  every airport and VFR waypoint of the tiles. */
const ROUTE_ONLY_HIDDEN = ["airports", "vfr-waypoints", "vfr-waypoints-idents"];

/** The overlay tiles' source and layers, by the slot each is drawn under
 *  (glLayer's SLOTS), for the map's first style. Every archive is built
 *  at the charts job's vector_tiles.VERSION, so each has every layer
 *  drawn here; nothing is in the field to stay compatible with. */
export function overlayStyle(
  tiles: OverlayTiles,
  origin?: string,
): { source: SourceSpecification; layers: Partial<Record<Slot, LayerSpecification[]>> } {
  const from = (layer: string) => ({ source: OVERLAY_SOURCE, "source-layer": layer });
  const lines: LayerSpecification[] = [
    ...runwayLayers(),
    ...specialUseLayers(),
    ...airspaceLayers(GL_FONT_BOLD),
    specialUseLabelLayer(GL_FONT_BOLD),
  ];
  // Bottom to top, and MapLibre places the top first, so where words
  // collide the higher keeps its place: the fields, then the VORs a pilot
  // tunes and steers by, then the VFR waypoints, then the enroute fixes,
  // the order the sectional gives them weight (Chart User's Guide). The
  // VORs were under the fixes, so an intersection's ident took a VOR's
  // place.
  const marks: LayerSpecification[] = [
    ...navaidMarks("fixes", from("fixes"), "fix", {
      filter: ["all", ["==", ["get", "enroute_low"], true], ["!=", ["get", "vfr"], true]],
      minzoom: glZoom(FIX_ZOOM),
    }),
    ...navaidMarks("vfr-waypoints", from("fixes"), "vfr", {
      filter: ["all", ["==", ["get", "vfr"], true], notOwn(ROUTE_WAYPOINTS)],
      minzoom: glZoom(FIX_ZOOM),
    }),
    ...navaidMarks("navaids", from("navaids"), "vor", {
      filter: ["in", ["get", "kind"], ["literal", VOR_KINDS]],
      minzoom: glZoom(VOR_ZOOM),
    }),
    airportMarksLayer(from("airports")),
  ];
  return { source: overlaySource(tiles, origin), layers: { lines, marks } };
}

/** The overlays added to a map made without them (their name came after
 *  its first style, or the planner built the archive since): the source,
 *  and each slot's layers first in that slot, under what the page has
 *  added there, as the first style would have put them. */
export function addOverlays(map: MlMap, tiles: OverlayTiles, origin?: string) {
  if (map.getSource(OVERLAY_SOURCE)) return;
  const style = overlayStyle(tiles, origin);
  map.addSource(OVERLAY_SOURCE, style.source);
  SLOTS.forEach((slot, i) => {
    const ids = map.getStyle().layers.map((l) => l.id);
    const before = ids[i === 0 ? 0 : ids.indexOf(slotId(SLOTS[i - 1]!)) + 1]!;
    for (const layer of style.layers[slot] ?? []) map.addLayer(layer, before);
  });
}

// ---- What changes over them ----------------------------------------------

// The map's global state the tile layers read (MapLibre's `global-state`
// expression): each change one setGlobalStateProperty, which MapLibre
// skips when the value is the same and applies to the layers that read
// it, rather than a filter or expression built again by hand.
const ROUTE_AIRPORTS = "routeAirports";
const ROUTE_WAYPOINTS = "routeWaypoints";
const SELECTED_AIRPORT = "selectedAirport";
// The open card's ident hidden in paint (AirportsGl writes it larger): a tap repaints, not a re-layout of every tile.
const SELECTED_HIDDEN: ExpressionSpecification = ["case", ["==", ["get", "ident"], ["global-state", SELECTED_AIRPORT]], 0, 1];
const SHOW_MILITARY = "showMilitary";
const SHOW_PRIVATE = "showPrivate";

/** Not one of the idents the route draws itself, held in the state (an
 *  unset state is none: MapLibre's `in` is false for a null list). */
function notOwn(key: string): ExpressionSpecification {
  return ["!", ["in", ["get", "ident"], ["global-state", key]]];
}

/** The state set where the map has the overlays' layers to read it. */
function setState(map: MlMap, key: string, value: unknown) {
  if (map.style) map.setGlobalStateProperty(key, value);
}

/** The Map card's layers on the tile layers: Aeronautical's airspace,
 *  VORs and fixes on or off, and Private/Military's fields shown or not, or
 *  shown whatever the switches say in an emergency (overlayFilters). */
export function applyOverlayFilters(map: MlMap, emergency = false, routeOnly = false) {
  if (!map.style) return;
  const prefs = usePreferences.getState();
  const visible = (ids: string[], on: boolean) => {
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  visible(AIRSPACE_TILE_LAYERS, prefs.aeronautical && !routeOnly);
  visible(NAVAID_TILE_LAYERS, prefs.aeronautical && !routeOnly);
  visible(ROUTE_ONLY_HIDDEN, !routeOnly);
  setState(map, SHOW_MILITARY, prefs.privateMilitary || emergency);
  setState(map, SHOW_PRIVATE, prefs.privateMilitary || emergency);
}

/** The idents the route draws itself (its fields' chips, its waypoints),
 *  left off the tile layers. */
export function setOverlayExclusion(map: MlMap, kind: "airports" | "waypoints", idents: string[]) {
  setState(map, kind === "airports" ? ROUTE_AIRPORTS : ROUTE_WAYPOINTS, [...new Set(idents)].sort());
}

/** The field whose card is open: its ident left off the tile layer,
 *  which the ring's own layer writes larger (AirportsGl). */
export function setSelectedAirport(map: MlMap, ident: string | null) {
  setState(map, SELECTED_AIRPORT, ident);
}

/** Each field's weather disc from its METAR (its flight category's colour,
 *  flightCategory colourOf), joined onto the tile airports by ident, with
 *  every one of Settings' Airport Weather. */
export function setAirportWeather(map: MlMap, colours: Map<string, string>) {
  setState(map, AIRPORT_WEATHER, Object.fromEntries(colours));
}
