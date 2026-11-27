import type { ExpressionSpecification, LayerSpecification, Map as MlMap, SourceSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { OverlayTiles } from "../../api/types";
import { usePreferences } from "../../preferences";
import { stationPictures } from "../marks/stationModel";
import { AIRPORT_IDENT_INK, AIRPORT_WEATHER, TILE_AIRPORT_ICON, airportIconSize, airportPictures } from "./airportIcons";
import { overlaySource } from "../sources/overlayTiles";
import { SLOTS, slotId, type Slot } from "./glLayer";
import { drawSvg, type DrawnImage } from "./drawSvg";
import { OVERLAY_SOURCE, SUA_LAYERS, airspaceLayers, glZoom, specialUseLayers } from "./glStyle";
import { GL_FONT_BOLD, LABEL_HALO, labelHalo, labelInk, labelText } from "./layers/common";
import { specialUseLabelLayer } from "./glSuaLabels";
import { OVERLAY_PICTURES } from "./glOverlayPictures";
import { runwayLayers } from "./glRunways";
import { CHART, MAP_ZOOM } from "../../tokens";
import { dimLayer } from "./mapDim";

export { OVERLAY_SOURCE };
/** The airports' own source on OVERLAY_SOURCE's archive: a change of the map's state their symbols read (each field's
 *  weather, the settings, the route's fields) lays out again every tile of their source, and on their own that is the
 *  airports alone, not the airspace, fixes and runways too (the map speed audit, 2026-11-27). */
export const AIRPORTS_SOURCE = "faa-airports";
/** The VFR waypoints' own source on the archive, for the same reason: the route's waypoints left off them (a filter by
 *  the map's state) lay out again their tiles alone at a route's edit, where every overlay tile was. */
const WAYPOINTS_SOURCE = "faa-vfr-waypoints";

/** The chart's own ink for a fix's ident. */
const FIX_INK = CHART.fixInk;
/** A VFR waypoint's ident on the WebGL map: in the green of ForeFlight's
 *  triangle, at the owner's ask (2026-11-07, from its screenshots), where
 *  the sectional prints a magenta flag (Chart User's Guide, VFR
 *  waypoints); a step deeper for words, as the triangle's green on the
 *  white halo was 4.4:1, under the 4.5:1 small words need. */
const VFR_GREEN = CHART.vfrGreenText;

/**
 * The cycle's FAA overlays from its vector tiles (lib/map/sources/overlayTiles, wingtip.vector_tiles), as the map's
 * first style holds them (GlMapShell): the Class B, C and D, the airports, the VORs, the low enroute chart's fixes, the
 * VFR waypoints and the runways, each drawn per tile as the chart is, with nothing asked of the planner for the view.
 * What changes over them -- which fields the settings hide, the route's own fields, each field's weather, the open
 * card's field -- is set here (applyOverlayFilters, setOverlayExclusion, setAirportWeather, markSelectedAirport); their
 * taps and cards are the layers' components' (AirportsGl, AirspaceGl, NavaidsGl).
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
/** A field's ident beside its mark, the labels capped by zoom: a
 *  towered field's (the tiles' `towered`, NASR's TWR_TYPE_CODE, or a
 *  Class B's, which field_mark_rank sizes largest) named wherever it is
 *  drawn, from zoom 5 (the owner, 2026-11-21: the towered fields and the
 *  Class B and C rings from 5, decision 0052); every other field named
 *  from map.zoom.airport-public, where the other public fields come in.
 *  The long hard runways' fields, drawn from 7, some 2,400 across the
 *  country, are named a zoom later: each was an ident to shape and place
 *  where nearly all gave way to their marks, and a wheel notch out from 7
 *  was about a second of the main thread's long tasks at 4x (the speed
 *  audit of 2026-11-21, finding 8). The cap thins only those names. */
const AIRPORT_IDENT_FAR: ExpressionSpecification = [
  "step",
  ["zoom"],
  ["case", ["any", ["==", ["get", "towered"], true], ["==", ["get", "size"], "largest"]], ["get", "ident"], ""],
  glZoom(MAP_ZOOM.airportPublic),
  ["get", "ident"],
];

/** A field's mark at the zooms its ident is named at (AIRPORT_IDENT_FAR), so no field is drawn bare. */
const AIRPORT_ICON_NAMED: ExpressionSpecification = [
  "step",
  ["zoom"],
  ["case", ["any", ["==", ["get", "towered"], true], ["==", ["get", "size"], "largest"]], TILE_AIRPORT_ICON, ""],
  glZoom(MAP_ZOOM.airportPublic),
  TILE_AIRPORT_ICON,
];

/** The fields drawn whatever their name: a Class B's (field_mark_rank's largest; the owner, 2026-11-17, "all the class
 *  B airports show even when zoomed out"). The open card's is AirportsGl's own layer's: a tap changes no filter. */
const KEPT_FIELD: ExpressionSpecification = ["==", ["get", "size"], "largest"];

/** The map's global state the settings' Private/Military switch sets (applyOverlayFilters), read by AIRPORT_SHOWN. */
const SHOW_MILITARY = "showMilitary";
const SHOW_PRIVATE = "showPrivate";

/** No armed services' or private field unless asked for (a joint-use one always), by the settings (applyOverlayFilters). */
export const AIRPORT_SHOWN: ExpressionSpecification[] = [
  ["any", ["boolean", ["global-state", SHOW_MILITARY], false], ["!=", ["get", "military"], "military"]],
  ["any", ["boolean", ["global-state", SHOW_PRIVATE], false], ["!=", ["get", "use"], "private"]],
];

/** A field's mark's size, the tile layers' and the open card's field's alike (airportIconSize). */
export const AIRPORT_ICON_SIZE = airportIconSize(glZoom(AIRPORTS_FARTHEST_ZOOM), glZoom(10), glZoom(13));

/** A Class C's field (field_mark_rank's larger): its own layer, placed before the other fields, as symbol-sort-key
 *  orders only within a tile and a small field across a tile's edge took a Class C's room, leaving its ring bare. */
const CLASS_C_FIELD: ExpressionSpecification = ["==", ["get", "size"], "larger"];

/** The tile airports' layers, bottom to top, for the taps and probes that read them. */
export const AIRPORT_TILE_LAYERS = ["airports", "airports-c", "airports-kept"];

/** The airports' symbol layers, from either source: the mark (airportIcons), its ident beside it in bold in the field's
 *  ink (the sectional sets an airport's name in its symbol's colour, Chart User's Guide, Airports), kept apart by MapLibre's
 *  collision in `rank` order, the engine's field_mark_rank: lowest placed first and winning, so a Class B's field
 *  (O'Hare), then a Class C's, then each tier by its longest hard runway. A field whose ident has no room is not drawn
 *  at all at that zoom, mark and name placed together (the owner's iPhone screenshot, 2026-11-23: the Great Lakes at
 *  zoom 6 strewn with unnamed marks); a Class B's field and the open card's keep their mark, only the name giving way
 *  (`airports-kept`, on top, so placed first), and a Class C's field is placed next (`airports-c`), so its ring, drawn
 *  from zoom 5 (decision 0052), stands with its field and name. The route's own fields and stops wear their own marks (RouteGl, StopMarksGl). */
function airportMarksLayers(from: { source: string; "source-layer"?: string }): SymbolLayerSpecification[] {
  const layer = (id: string, kept: boolean, tier: ExpressionSpecification): SymbolLayerSpecification => ({
    id,
    type: "symbol",
    ...from,
    minzoom: glZoom(AIRPORTS_FARTHEST_ZOOM),
    // The fields the settings show, and none the route draws itself.
    filter: ["all", ...AIRPORT_SHOWN, notOwn(ROUTE_AIRPORTS), kept ? KEPT_FIELD : ["!", KEPT_FIELD], tier],
    layout: {
      "icon-image": kept ? TILE_AIRPORT_ICON : AIRPORT_ICON_NAMED,
      // Each field at its own size step, the biggest largest (airportIconSize).
      "icon-size": AIRPORT_ICON_SIZE,
      "icon-allow-overlap": kept,
      // Two px round each mark at every zoom: out at a few states the towered fields then stand side by side in rank
      // order, as ForeFlight's do, where 27 px round each (to the app's zoom 7) left one field a metro (2026-11-21).
      "icon-padding": 2,
      "symbol-sort-key": ["get", "rank"],
      "text-field": AIRPORT_IDENT_FAR,
      ...labelText("airportIdent"),
      "text-anchor": "left",
      "text-offset": [1.15, 0],
      // A kept field's ident gives way and its mark stays; any other field's mark and ident go together.
      "icon-optional": false,
      "text-optional": kept,
      "text-padding": 1,
    },
    paint: {
      "text-color": unlessSelected(labelInk(AIRPORT_IDENT_INK)),
      "text-halo-color": unlessSelected(labelHalo("airportIdent")["text-halo-color"]!),
      "text-halo-width": labelHalo("airportIdent")["text-halo-width"]!,
    },
  });
  return [
    layer("airports", false, ["!", CLASS_C_FIELD]),
    layer("airports-c", false, CLASS_C_FIELD),
    layer("airports-kept", true, ["literal", true]),
  ];
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

/** The navaids' zooms, in the app's levels (design/tokens.json's map.zoom,
 *  every app's): the VORs from a region's, the fixes and the VFR waypoints
 *  closer in (NavaidCards, WaypointCard). */
const VOR_ZOOM = MAP_ZOOM.vor;
const FIX_ZOOM = MAP_ZOOM.fix;
/** The VORs a pilot tunes (wingtip.fixes.VOR_KINDS, NASR NAV_TYPE). */
const VOR_KINDS = ["VORTAC", "VOR/DME", "VOR"];

/** The ids of the layers each setting turns off (applyOverlayFilters). */
export const AIRSPACE_TILE_LAYERS = [
  ...["D", "C", "B"].flatMap((c) => [`airspace-${c}-band`, `airspace-${c}`]),
  "airspace-labels",
  ...SUA_LAYERS,
];
const NAVAID_TILE_LAYERS = ["navaids", "navaids-idents", "fixes", "fixes-idents"];
/** What the route's points alone leave out besides (lib/map/routeOnly):
 *  every airport and VFR waypoint of the tiles. */
const ROUTE_ONLY_HIDDEN = [...AIRPORT_TILE_LAYERS, "vfr-waypoints", "vfr-waypoints-idents"];

/** The overlay tiles' source and layers, by the slot each is drawn under
 *  (glLayer's SLOTS), for the map's first style. Every archive is built
 *  at the charts job's vector_tiles.VERSION, so each has every layer
 *  drawn here; nothing is in the field to stay compatible with. */
export function overlayStyle(
  tiles: OverlayTiles,
  origin?: string,
): { sources: Record<string, SourceSpecification>; layers: Partial<Record<Slot, LayerSpecification[]>> } {
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
    ...navaidMarks("vfr-waypoints", { source: WAYPOINTS_SOURCE, "source-layer": "fixes" }, "vfr", {
      filter: ["all", ["==", ["get", "vfr"], true], notOwn(ROUTE_WAYPOINTS)],
      minzoom: glZoom(FIX_ZOOM),
    }),
    ...navaidMarks("navaids", from("navaids"), "vor", {
      filter: ["in", ["get", "kind"], ["literal", VOR_KINDS]],
      minzoom: glZoom(VOR_ZOOM),
    }),
    ...airportMarksLayers({ source: AIRPORTS_SOURCE, "source-layer": "airports" }),
  ];
  // Each field's and each ring's id its ident, for the states a tap and a placed field set (feature-state, which
  // repaints and lays out nothing).
  const sources = {
    [OVERLAY_SOURCE]: { ...overlaySource(tiles, origin), promoteId: { airspace: "ident" } },
    [AIRPORTS_SOURCE]: { ...overlaySource(tiles, origin), promoteId: { airports: "ident" } },
    // Its tiles asked for only from the zoom its layers are drawn at (FIX_ZOOM), each from the same fetch (overlayTiles).
    [WAYPOINTS_SOURCE]: overlaySource(tiles, origin),
  };
  // At the Dimmer's brightness at night, as everything drawn on the chart (mapDim).
  return { sources, layers: { lines: lines.map(dimLayer), marks: marks.map(dimLayer) } };
}

/** The overlays added to a map made without them (their name came after
 *  its first style, or the planner built the archive since): the source,
 *  and each slot's layers first in that slot, under what the page has
 *  added there, as the first style would have put them. */
export function addOverlays(map: MlMap, tiles: OverlayTiles, origin?: string) {
  if (map.getSource(OVERLAY_SOURCE)) return;
  const style = overlayStyle(tiles, origin);
  for (const [id, source] of Object.entries(style.sources)) map.addSource(id, source);
  SLOTS.forEach((slot, i) => {
    const ids = map.getStyle().layers.map((l) => l.id);
    const before = ids[i === 0 ? 0 : ids.indexOf(slotId(SLOTS[i - 1]!)) + 1]!;
    for (const layer of style.layers[slot] ?? []) map.addLayer(layer, before);
  });
}

// ---- What changes over them ----------------------------------------------

// The map's global state the tile layers read (MapLibre's `global-state`): each change one setGlobalStateProperty,
// skipped when the value is the same; one read by a filter or the layout lays the layer's source out again.
const ROUTE_AIRPORTS = "routeAirports";
const ROUTE_WAYPOINTS = "routeWaypoints";
/** The open card's field's ident left to AirportsGl's larger one, by its feature state: a tap repaints only. Hidden by
 *  its colours, its opacities constants times the Dimmer (mapDim): an opacity by feature state times the Dimmer's global
 *  state laid every airports tile out again at each step of the Dimmer. Its mark is not hidden: AirportsGl's
 *  SELECTED_MARK is the same picture at the same size over it. */
function unlessSelected(colour: ExpressionSpecification | string): ExpressionSpecification {
  return ["case", ["boolean", ["feature-state", "selected"], false], "transparent", colour] as ExpressionSpecification;
}

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

/** The field whose card is open, `on` or no longer: its tile mark and ident hidden, AirportsGl drawing them. */
export function markSelectedAirport(map: MlMap, id: string, on: boolean) {
  if (map.style && map.getSource(AIRPORTS_SOURCE))
    map.setFeatureState({ source: AIRPORTS_SOURCE, sourceLayer: "airports", id }, { selected: on });
}

/** Each field's weather disc from its METAR (its flight category's colour,
 *  flightCategory colourOf), joined onto the tile airports by ident, with
 *  every one of Settings' Airport Weather. */
export function setAirportWeather(map: MlMap, colours: Map<string, string>) {
  setState(map, AIRPORT_WEATHER, Object.fromEntries(colours));
}
