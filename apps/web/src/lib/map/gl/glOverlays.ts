import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MlMap,
  MapGeoJSONFeature,
  SourceSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { OverlayTiles } from "../../api/types";
import type { AirspaceVolume, VorPin } from "../sources/overlayTypes";
import { usePreferences } from "../../preferences";
import { BLUE } from "../../useAirspace";
import { TOWERED_BLUE, UNTOWERED_MAGENTA } from "../marks/airportMark";
import { stationPictures } from "../marks/stationModel";
import { AIRPORT_WEATHER, TILE_AIRPORT_ICON, airportIconSize, airportPictures, TOWERED } from "./airportIcons";
import { overlaySource } from "../sources/overlayTiles";
import { SLOTS, drawSvg, slotId, type DrawnImage, type Slot, type Stretch } from "./glLayer";
import {
  AIRSPACE_INK,
  OVERLAY_SOURCE,
  SUA_INK,
  SUA_LAYERS,
  airspaceLayers,
  airspaceTab,
  glZoom,
  specialUseLayers,
  suaHatch,
} from "./glStyle";
import { GL_FONT_BOLD, LABEL_HALO } from "./layers/common";
import { SUA_TAB_PICTURES, specialUseLabelLayer } from "./glSuaLabels";
import { CHART } from "../../tokens";

export { OVERLAY_SOURCE };

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

/** The chart's own ink for a fix's ident. */
const FIX_INK = CHART.fixInk;
/** A fix's star, ForeFlight's blue (the owner's screenshot over Lake
 *  Michigan, 2026-11-08), the Class B's. */
const FIX_BLUE = CHART.airspaceBlue;
/** A VFR waypoint's ink on the WebGL map: ForeFlight's green triangle, at
 *  the owner's ask (2026-11-07, from its screenshots), where the
 *  sectional prints a magenta flag (Chart User's Guide, VFR waypoints). */
const VFR_GREEN = CHART.vfrGreen;

type Picture = [id: string, svg: () => string, stretch?: Stretch];

/** The navaids' pictures: the VOR's hexagon (FAA Aeronautical Chart
 *  User's Guide, Radio Aids to Navigation), a fix's four-point star as
 *  ForeFlight draws an enroute fix over the chart (blue, a white rim:
 *  the owner's screenshot over Lake Michigan, 2026-11-08), a VFR
 *  waypoint's green triangle (the owner's pick, 2026-11-07), and the
 *  VOR's blue ident box, stretched to its ident. */
const NAVAID_PICTURES: Picture[] = [
  [
    "nav|vor",
    () =>
      `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="15,8 11.5,14.06 4.5,14.06 1,8 4.5,1.94 11.5,1.94" fill="${CHART.casing}" stroke="${BLUE}" stroke-width="2"/><circle cx="8" cy="8" r="1.6" fill="${BLUE}"/></svg>`,
  ],
  [
    "nav|fix",
    () =>
      `<svg width="20" height="20" viewBox="-10 -10 20 20"><path d="M0 -9L2.2 -2.2L9 0L2.2 2.2L0 9L-2.2 2.2L-9 0L-2.2 -2.2Z" fill="${FIX_BLUE}" stroke="${CHART.casing}" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  ],
  [
    "nav|vfr",
    () =>
      `<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 11.2,10.4 0.8,10.4" fill="${VFR_GREEN}" stroke="${CHART.casing}" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  ],
  [
    "nav|tag",
    () => `<svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="3" fill="${BLUE}"/></svg>`,
    { inset: 4 },
  ],
];

/** The dark tab an airspace's altitudes sit in, as ForeFlight's: a
 *  rounded box bordered in its class's ink, its corners kept as drawn,
 *  stretched to the text. */
const AIRSPACE_TAB_PICTURES: Picture[] = (["B", "C", "D"] as const).map((c) => [
  airspaceTab(c),
  () =>
    `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="0.75" y="0.75" width="10.5" height="10.5" rx="3" fill="${CHART.tag}" fill-opacity="0.92" stroke="${AIRSPACE_INK[c].colour}" stroke-width="1.5"/></svg>`,
  { inset: 4 },
]);

/** A special-use area's hatch, one tick of it: a short diagonal stroke
 *  in the area's ink on a faint wash of it, repeated along the band
 *  (specialUseLayers' line-pattern), as ForeFlight and the sectional
 *  hatch the inside of the boundary. */
const SUA_PICTURES: Picture[] = (Object.keys(SUA_INK) as (keyof typeof SUA_INK)[])
  .map((ink): Picture => [
    suaHatch(ink),
    () =>
      `<svg width="7" height="10" viewBox="0 0 7 10"><rect width="7" height="10" fill="${SUA_INK[ink]}" fill-opacity="0.14"/><path d="M1.5 9.5L5.5 0.5" stroke="${SUA_INK[ink]}" stroke-width="1.3" stroke-linecap="round" stroke-opacity="0.9"/></svg>`,
  ])
  .concat(SUA_TAB_PICTURES); // and their tabs (glSuaLabels)

let drawn: Promise<Map<string, DrawnImage>> | null = null;
/** Every picture the overlay layers wear, drawn once a page at the
 *  screen's density, for the map to take in its missing-image resolver
 *  as a tile first asks for one (MapLibre waits on it, so no symbol is
 *  laid out without its picture). */
export function overlayPictures(): Promise<Map<string, DrawnImage>> {
  drawn ??= Promise.all([
    ...airportPictures().map((p) => p.draw().then((d) => [p.id, d] as const)),
    ...[...stationPictures(), ...NAVAID_PICTURES, ...AIRSPACE_TAB_PICTURES, ...SUA_PICTURES].map(([id, svg, stretch]) =>
      drawSvg(svg(), stretch).then((d) => [id, d] as const),
    ),
  ]).then((all) => new Map(all.filter((e): e is readonly [string, DrawnImage] => !!e[1])));
  return drawn;
}

// ---- The layers -----------------------------------------------------------

/** The airports' zooms, in the app's levels: the farthest out any
 *  is drawn. Within it each field is in the tiles from its own zoom by
 *  its tier (AIRPORT_MIN_ZOOM in services/jobs/charts/overlays.py):
 *  towered, then the long hard runways, other public fields, private
 *  ones, heliports. */
const AIRPORTS_FARTHEST_ZOOM = 4;

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
      // Out at a few states, a mark keeps some 80 px from the next; closer in, its own: every field at a field's own scale.
      "icon-padding": ["step", ["zoom"], 27, glZoom(7), 2],
      "symbol-sort-key": ["get", "rank"],
      "text-field": ["get", "ident"],
      "text-font": GL_FONT_BOLD,
      "text-size": ["interpolate", ["linear"], ["zoom"], glZoom(AIRPORTS_FARTHEST_ZOOM), 10, glZoom(10), 12, glZoom(13), 13],
      "text-anchor": "left",
      "text-offset": [1.15, 0],
      // The ident gives way, the mark stays: a busy area keeps its fields.
      "text-optional": true,
      "text-padding": 1,
    },
    paint: { "text-color": ["case", TOWERED, TOWERED_BLUE, UNTOWERED_MAGENTA], ...LABEL_HALO, "text-opacity": SELECTED_HIDDEN },
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
        "text-font": GL_FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 10, 12],
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 1.1,
        "text-justify": "auto",
        "icon-image": ["case", ["==", kind, "vor"], "nav|tag", ""] as ExpressionSpecification,
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 4, 1, 4],
      },
      paint: {
        "text-color": ["match", kind, "vor", CHART.casing, "vfr", VFR_GREEN, FIX_INK] as ExpressionSpecification,
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
        "text-font": GL_FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 10, 16, 16],
        "text-rotation-alignment": "map",
        "text-rotate": ["get", "heading"],
        // Up the number's own page, which is down the runway from its end.
        "text-offset": [0, -1.1],
        "text-allow-overlap": true,
      },
      paint: { "text-color": CHART.casing, "text-halo-color": CHART.fixInk, "text-halo-width": 1.75 },
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

/** The overlay tiles' source and layers, by the slot each is drawn under
 *  (glLayer's SLOTS), for the map's first style; the layers of a layer the
 *  archive has not got (an older build's) left out. */
export function overlayStyle(
  tiles: OverlayTiles,
  origin?: string,
): { source: SourceSpecification; layers: Partial<Record<Slot, LayerSpecification[]>> } {
  const has = new Set(tiles.layers.map((l) => l.name));
  const from = (layer: string) => ({ source: OVERLAY_SOURCE, "source-layer": layer });
  const lines: LayerSpecification[] = [
    ...(has.has("runways") ? runwayLayers() : []),
    ...(has.has("special_use") ? specialUseLayers() : []),
    ...(has.has("airspace") ? airspaceLayers(GL_FONT_BOLD, has.has("airspace_labels")) : []),
    ...(has.has("special_use") ? [specialUseLabelLayer(GL_FONT_BOLD, has.has("special_use_labels"))] : []),
  ];
  const marks: LayerSpecification[] = [
    ...(has.has("navaids")
      ? navaidMarks("navaids", from("navaids"), "vor", {
          filter: ["in", ["get", "kind"], ["literal", VOR_KINDS]],
          minzoom: glZoom(VOR_ZOOM),
        })
      : []),
    ...(has.has("fixes")
      ? [
          ...navaidMarks("fixes", from("fixes"), "fix", {
            filter: ["all", ["==", ["get", "enroute_low"], true], ["!=", ["get", "vfr"], true]],
            minzoom: glZoom(FIX_ZOOM),
          }),
          ...navaidMarks("vfr-waypoints", from("fixes"), "vfr", {
            filter: ["all", ["==", ["get", "vfr"], true], notOwn(ROUTE_WAYPOINTS)],
            minzoom: glZoom(FIX_ZOOM),
          }),
        ]
      : []),
    ...(has.has("airports") ? [airportMarksLayer(from("airports"))] : []),
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

/** The settings on the tile layers: Airspace, VORs and Fixes on or off,
 *  and the armed services' own fields and private ones shown or not, or
 *  shown whatever the switches say in an emergency (overlayFilters). */
export function applyOverlayFilters(map: MlMap, emergency = false) {
  if (!map.style) return;
  const prefs = usePreferences.getState();
  const visible = (ids: string[], on: boolean) => {
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  visible(AIRSPACE_TILE_LAYERS, prefs.airspace);
  visible(NAVAID_TILE_LAYERS, prefs.navaids);
  setState(map, SHOW_MILITARY, prefs.military || emergency);
  setState(map, SHOW_PRIVATE, prefs.privateFields || emergency);
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

// ---- What a card needs, from a tapped feature ---------------------------

const text = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const number = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** A tapped ring of the tiles' `airspace` layer as the volume the
 *  card reads (AirspaceCardBody): its fields are wingtip.vector_tiles'
 *  (CLASS, NAME, IDENT, the floor and ceiling, TNI, WKHR_CODE/RMK). */
export function volumeOfTile(f: Pick<MapGeoJSONFeature, "properties">, at: { lat: number; lon: number }): AirspaceVolume {
  const p = f.properties;
  const floor = number(p.floor_ft) ?? 0;
  return {
    id: `tile-${p.number ?? `${p.class}-${p.ident ?? ""}-${p.name ?? ""}-${floor}`}`,
    name: String(p.name ?? ""),
    ident: text(p.ident),
    airspace_class: String(p.class) as AirspaceVolume["airspace_class"],
    floor_ft: floor,
    floor_sfc: floor === 0,
    ceiling_ft: number(p.ceiling_ft),
    ceiling_excluded: p.ceiling_excluded === true || p.ceiling_excluded === "true",
    hours_code: text(p.hours_code),
    hours_remark: text(p.hours_remark),
    label_lat: at.lat,
    label_lon: at.lon,
  };
}

/** A VOR of the tiles' `navaids` layer as the card reads it (VorCard):
 *  NASR NAV_BASE's fields as wingtip.fixes reads them, its remarks
 *  (NAV_RMK, one a line) where the archive carries them. */
export function vorOfTile(f: Pick<MapGeoJSONFeature, "properties" | "geometry">): VorPin {
  const p = f.properties;
  const [lon, lat] = f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : [0, 0];
  return {
    ident: String(p.ident),
    name: text(p.name),
    kind: String(p.kind) as VorPin["kind"],
    lat,
    lon,
    freq: text(p.freq),
    channel: text(p.channel),
    service_volume: text(p.service_volume),
    mag_var: number(p.mag_var),
    elevation_ft: number(p.elevation_ft),
    hours: text(p.hours),
    restricted: p.restricted === true || p.restricted === "true",
    remarks: text(p.remarks)?.split("\n") ?? [],
  };
}

/** A point feature's place. */
export function pointOf(f: Pick<MapGeoJSONFeature, "geometry">): { lat: number; lon: number } | null {
  if (f.geometry.type !== "Point") return null;
  const [lon, lat] = f.geometry.coordinates as [number, number];
  return { lat, lon };
}
