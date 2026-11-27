import type { LayerSpecification, Map as MlMap, SourceSpecification } from "maplibre-gl";
import type { OverlayTiles } from "../../api/types";
import { usePreferences } from "../../preferences";
import {
  OVERLAY_EXPRESSIONS,
  OVERLAY_FEATURE_STATE,
  OVERLAY_GROUPS,
  OVERLAY_LINES,
  OVERLAY_MARKS,
  OVERLAY_SOURCES,
  OVERLAY_STATE,
} from "../../generated/overlayLayers";
import { stationPictures } from "../marks/stationModel";
import { AIRPORT_WEATHER, airportPictures } from "./airportIcons";
import { overlaySource } from "../sources/overlayTiles";
import { SLOTS, slotId, type Slot } from "./glLayer";
import { drawSvg, type DrawnImage } from "./drawSvg";
import { OVERLAY_SOURCE } from "./glStyle";
import { OVERLAY_PICTURES } from "./glOverlayPictures";
import { dimLayer } from "./mapDim";

export { OVERLAY_SOURCE };
/** The airports' own source on OVERLAY_SOURCE's archive: a change of the map's state their symbols read (each field's
 *  weather, the settings, the route's fields) lays out again every tile of their source, and on their own that is the
 *  airports alone, not the airspace, fixes and runways too (the map speed audit, 2026-11-27). */
export const AIRPORTS_SOURCE = OVERLAY_SOURCES.airports;
/** The VFR waypoints' own source on the archive, for the same reason: the route's waypoints left off them (a filter by
 *  the map's state) lay out again their tiles alone at a route's edit, where every overlay tile was. */
const WAYPOINTS_SOURCE = OVERLAY_SOURCES.waypoints;

/**
 * The cycle's FAA overlays from its vector tiles (lib/map/sources/overlayTiles, wingtip.vector_tiles), as the map's
 * first style holds them (GlMapShell): design/map-style.json's layers (lib/generated/overlayLayers, Android's the
 * same), each drawn per tile as the chart is, with nothing asked of the planner for the view. Here the web's own part:
 * the sources, the pictures, and what changes over them -- which fields the settings hide, the route's own fields,
 * each field's weather, the open card's field (applyOverlayFilters, setOverlayExclusion, setAirportWeather,
 * markSelectedAirport); their taps and cards are the layers' components' (AirportsGl, AirspaceGl, NavaidsGl).
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

/** No armed services' or private field unless asked for (a joint-use one always), by the settings (applyOverlayFilters). */
export const AIRPORT_SHOWN = [OVERLAY_EXPRESSIONS.militaryShown, OVERLAY_EXPRESSIONS.privateShown];

/** A field's mark's size, the tile layers' and the open card's field's alike (design/map-style.json's airportIconSize). */
export const AIRPORT_ICON_SIZE = OVERLAY_EXPRESSIONS.airportIconSize;

/** The tile airports' layers, bottom to top, for the taps and probes that read them. */
export const AIRPORT_TILE_LAYERS: readonly string[] = OVERLAY_GROUPS.airports;

/** The ids of the layers each setting turns off (applyOverlayFilters). */
export const AIRSPACE_TILE_LAYERS: readonly string[] = OVERLAY_GROUPS.airspace;
/** What the route's points alone leave out besides (lib/map/routeOnly):
 *  every airport and VFR waypoint of the tiles. */
const ROUTE_ONLY_HIDDEN = [...OVERLAY_GROUPS.airports, ...OVERLAY_GROUPS.waypoints];

/** The overlay tiles' source and layers, by the slot each is drawn under
 *  (glLayer's SLOTS), for the map's first style. Every archive is built
 *  at the charts job's vector_tiles.VERSION, so each has every layer
 *  drawn here; nothing is in the field to stay compatible with. The
 *  layers' order and look are design/map-style.json's. */
export function overlayStyle(
  tiles: OverlayTiles,
  origin?: string,
): { sources: Record<string, SourceSpecification>; layers: Partial<Record<Slot, LayerSpecification[]>> } {
  // Each field's and each ring's id its ident, for the states a tap and a placed field set (feature-state, which
  // repaints and lays out nothing).
  const sources = {
    [OVERLAY_SOURCE]: { ...overlaySource(tiles, origin), promoteId: { airspace: "ident" } },
    [AIRPORTS_SOURCE]: { ...overlaySource(tiles, origin), promoteId: { airports: "ident" } },
    // Its tiles asked for only from the zoom its layers are drawn at (map.zoom.fix), each from the same fetch (overlayTiles).
    [WAYPOINTS_SOURCE]: overlaySource(tiles, origin),
  };
  // At the Dimmer's brightness at night, as everything drawn on the chart (mapDim).
  return { sources, layers: { lines: OVERLAY_LINES.map(dimLayer), marks: OVERLAY_MARKS.map(dimLayer) } };
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

// The map's global state the tile layers read (MapLibre's `global-state`, OVERLAY_STATE): each change one
// setGlobalStateProperty, skipped when the value is the same; one read by a filter or the layout lays the layer's
// source out again. The open card's field's ident is left to AirportsGl's larger one by its feature state.

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
  const visible = (ids: readonly string[], on: boolean) => {
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  visible(OVERLAY_GROUPS.airspace, prefs.aeronautical && !routeOnly);
  visible(OVERLAY_GROUPS.navaids, prefs.aeronautical && !routeOnly);
  visible(ROUTE_ONLY_HIDDEN, !routeOnly);
  setState(map, OVERLAY_STATE.showMilitary, prefs.privateMilitary || emergency);
  setState(map, OVERLAY_STATE.showPrivate, prefs.privateMilitary || emergency);
}

/** The idents the route draws itself (its fields' chips, its waypoints),
 *  left off the tile layers. */
export function setOverlayExclusion(map: MlMap, kind: "airports" | "waypoints", idents: string[]) {
  setState(map, kind === "airports" ? OVERLAY_STATE.routeAirports : OVERLAY_STATE.routeWaypoints, [...new Set(idents)].sort());
}

/** The field whose card is open, `on` or no longer: its tile mark and ident hidden, AirportsGl drawing them. */
export function markSelectedAirport(map: MlMap, id: string, on: boolean) {
  if (map.style && map.getSource(AIRPORTS_SOURCE))
    map.setFeatureState({ source: AIRPORTS_SOURCE, sourceLayer: "airports", id }, { [OVERLAY_FEATURE_STATE.selected]: on });
}

/** Each field's weather disc from its METAR (its flight category's colour,
 *  flightCategory colourOf), joined onto the tile airports by ident, with
 *  every one of Settings' Airport Weather. */
export function setAirportWeather(map: MlMap, colours: Map<string, string>) {
  setState(map, AIRPORT_WEATHER, Object.fromEntries(colours));
}
