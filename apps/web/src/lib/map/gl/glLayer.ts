import type { PickKind } from "../mapPick";
import { createContext, useContext, useEffect, useRef, type ReactNode, useEffectEvent } from "react";
import { prefersReducedMotion } from "../../motion";
import { toDrawnLine } from "./legTap";
import type {
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MlMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  SourceSpecification,
} from "maplibre-gl";
import { dimLayer, dimmedOpacity, isDimmed } from "./mapDim";

/**
 * The WebGL map's layer API (lib/map/gl): each thing drawn on the map is
 * a React component that says, through these hooks, what it adds -- its
 * sources and its style layers, in one of the map's slots -- what data it
 * gives them, and what a tap on it does. The map (GlMapShell) owns the
 * camera, the sheet and the one tap that goes to the nearest thing.
 */

/** Where a layer is drawn, bottom to top: land and water where the
 *  chart ends, the chart, imagery over it at the pilot's ask, areas (a
 *  TFR's fill, weather), lines (airspace, airways), the route, marks
 *  (airports, navaids, checkpoints), and what is over all (own ship, the
 *  traffic). Each slot is an empty layer of the shell's that a layer is
 *  put under, so the order holds however the layers come and go. */
export const SLOTS = ["base", "chart", "imagery", "areas", "lines", "route", "marks", "top"] as const;
export type Slot = (typeof SLOTS)[number];
export const slotId = (slot: Slot) => `slot-${slot}`;

/** A tap on the map, given to the nearest thing: the taps registered are
 *  asked in their `rank` order (a mark before a line under it), each
 *  within its own `reach` of the finger, and the first that finds a
 *  feature of its layers has it. */
export interface GlTap {
  layers: string[];
  /** px each side of the finger: 22 is a 44 pt target. */
  reach: number;
  /** Lower first. */
  rank: number;
  /** Only the features of its layers this keeps (a style filter). */
  filter?: FilterSpecification;
  onTap: (feature: MapGeoJSONFeature, event: MapMouseEvent) => void;
  /** Instead of the style's `layers`, a finder of its own: deck.gl's
   *  picking (lib/map/gl/deckLayers useDeckTap). */
  find?: (point: { x: number; y: number }) => MapGeoJSONFeature | null;
}

/** What a tap finds under the finger, within its reach: the nearest
 *  feature of its layers (nearestHit), or what its own finder picks. */
function tapHit(map: MlMap, tap: GlTap, point: { x: number; y: number }): MapGeoJSONFeature | null {
  if (tap.find) return tap.find(point);
  const layers = tap.layers.filter((l) => map.getLayer(l));
  if (!layers.length) return null;
  const r = tap.reach;
  const found = map.queryRenderedFeatures(
    [
      [point.x - r, point.y - r],
      [point.x + r, point.y + r],
    ],
    { layers, filter: tap.filter },
  );
  return nearestHit(found, point, r, (at) => map.project(at));
}

/** The tap a finger's tap is for and what it found: the lowest rank that
 *  finds anything, and of that rank's taps the one whose mark is nearest
 *  the finger. An airplane drawn under the finger won over nothing of its
 *  own rank before; a field's mark 20 points off, registered first, took
 *  the tap at a pick's zoom (tracking.spec). */
export function pickTap(map: MlMap, taps: Iterable<GlTap>, point: { x: number; y: number }) {
  let best: { tap: GlTap; hit: MapGeoJSONFeature } | null = null,
    near = Infinity;
  for (const tap of [...taps].sort((a, b) => a.rank - b.rank)) {
    if (best && tap.rank > best.tap.rank) break;
    const hit = tapHit(map, tap, point);
    if (!hit) continue;
    const at = hit.geometry.type === "Point" ? map.project(hit.geometry.coordinates as [number, number]) : point;
    const d = Math.hypot(at.x - point.x, at.y - point.y);
    if (d < near) [best, near] = [{ tap, hit }, d];
  }
  return best;
}

/** Of the features MapLibre found in a finger's square, the one the tap
 *  is for: a mark (a point) only where its point is within `reach` of the
 *  finger, its 44-point target, the nearest first; a line the nearest as
 *  drawn (a Class D ring under the finger, not a Class B line 10 points
 *  off that MapLibre listed first: airspace-lines.spec); an area in the
 *  square as MapLibre gave it, the topmost. The square also takes in
 *  a mark's drawn words and chip, so a field's ident or a route's pill
 *  whose point was a finger and more away took the tap: on the chart
 *  beside a field's name, its card opened rather than the open card
 *  putting itself away (map.spec), and on O'Hare at the route's whole
 *  view, C81's chip (classb.spec). */
export function nearestHit(
  found: MapGeoJSONFeature[],
  finger: { x: number; y: number },
  reach: number,
  project: (at: [number, number]) => { x: number; y: number },
): MapGeoJSONFeature | null {
  let best: MapGeoJSONFeature | null = null,
    near = Infinity;
  for (const f of found) {
    let d = 0;
    if (f.geometry.type === "Point") {
      const at = project(f.geometry.coordinates as [number, number]);
      d = Math.hypot(at.x - finger.x, at.y - finger.y);
      if (d > reach) continue;
    } else if (f.layer?.type === "line") d = toDrawnLine(f.geometry, finger, project);
    if (!best || d < near) [best, near] = [f, d];
  }
  return best;
}

export interface GlMapApi {
  map: MlMap;
  addTap: (tap: GlTap) => () => void;
  /** A tap on the chart itself, nothing within reach: what puts a card
   *  away (an airport's, which the page holds). */
  addMiss: (miss: (event: MapMouseEvent) => void) => () => void;
  /** A card in the map's sheet (SheetCard), for what a tap on the map
   *  opens, every other pick put away first (lib/map/mapPick), and `also`
   *  what was picked with it and goes with it (a point's ring); null puts
   *  it away. */
  openCard: (card: ReactNode | null, also?: readonly PickKind[]) => void;
  /** Whether the map has the cycle's overlay tiles (glOverlays): its
   *  airspace, airports, navaids, fixes and runways drawn per tile from
   *  the archive, a layer of them adding only its taps, its filters and
   *  its probes. False until the archive's name has come (the planner
   *  builds it once a cycle); the layers draw nothing till then. */
  overlays: boolean;
}

export const GlMapContext = createContext<GlMapApi | null>(null);

export function useGlMap(): GlMapApi {
  const api = useContext(GlMapContext);
  if (!api) throw new Error("useGlMap outside GlMapShell");
  return api;
}

/** What each map's layers were added as, by `s:<source id>` and
 *  `l:<layer id>`, and the ones a map handed from one page's tree to the
 *  next has not had claimed again yet (parkLayers, sweepLayers). */
const added = new WeakMap<MlMap, Map<string, string>>();
const unclaimed = new WeakMap<MlMap, Set<string>>();
const parked = new WeakSet<MlMap>();
const addedOf = (map: MlMap) => {
  let kept = added.get(map);
  if (!kept) added.set(map, (kept = new Map()));
  return kept;
};

/** The map is being handed to the next tree that draws it (GlMapShell's
 *  park): the layers of the tree leaving stay where they are, for the
 *  next to claim as they are rather than draw again from nothing. */
export function parkLayers(map: MlMap) {
  parked.add(map);
}

/** The map taken up again: every layer of the last tree is unclaimed
 *  until the new tree adds the same. */
export function adoptLayers(map: MlMap) {
  parked.delete(map);
  unclaimed.set(map, new Set(addedOf(map).keys()));
}

/** Once the new tree has added its own: the last tree's layers it did not
 *  claim taken away, its layers first and then their sources. */
export function sweepLayers(map: MlMap) {
  const left = unclaimed.get(map);
  unclaimed.delete(map);
  if (!left?.size || !map.style) return;
  const kept = addedOf(map);
  for (const key of left) if (key.startsWith("l:") && map.getLayer(key.slice(2))) map.removeLayer(key.slice(2));
  for (const key of left) if (key.startsWith("s:") && map.getSource(key.slice(2))) removeSource(map, key.slice(2));
  for (const key of left) kept.delete(key);
}

/** A source and every layer drawn from it. */
function removeSource(map: MlMap, id: string) {
  for (const layer of map.getStyle().layers) if ("source" in layer && layer.source === id) map.removeLayer(layer.id);
  map.removeSource(id);
}

/** Adds `sources` and `layers` under `slot` while mounted. The specs are
 *  read once a map: a style that changes goes through setPaintProperty
 *  (useGlPaint) or the data (useGlData). A source or layer already there
 *  as the same spec -- the last tree's, on a map handed over (parkLayers)
 *  -- is claimed as it is, its tiles and data kept. With `under`, drawn
 *  under that layer where the map has it (a ring under its marks). */
export function useGlLayer(slot: Slot, sources: Record<string, SourceSpecification>, layers: LayerSpecification[], under?: string) {
  const { map } = useGlMap();
  const spec = useRef({ sources, layers });
  useEffect(() => {
    const { sources, layers } = spec.current;
    const kept = addedOf(map);
    const left = unclaimed.get(map);
    for (const [id, source] of Object.entries(sources)) {
      const key = `s:${id}`,
        as = JSON.stringify(source);
      if (map.getSource(id) && kept.has(key) && kept.get(key) !== as) removeSource(map, id);
      if (!map.getSource(id)) map.addSource(id, source);
      kept.set(key, as);
      left?.delete(key);
    }
    for (const layer of layers) {
      const key = `l:${layer.id}`,
        as = JSON.stringify(layer);
      if (map.getLayer(layer.id) && kept.get(key) !== as) map.removeLayer(layer.id);
      // At the Dimmer's brightness at night, as everything drawn on the chart (mapDim).
      if (!map.getLayer(layer.id)) map.addLayer(dimLayer(layer), under && map.getLayer(under) ? under : slotId(slot));
      kept.set(key, as);
      left?.delete(key);
    }
    return () => {
      // The map gone first (the page left) takes its layers with it; one
      // being handed to the next tree keeps them for it to claim.
      if (!map.style || parked.has(map)) return;
      for (const layer of layers) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        kept.delete(`l:${layer.id}`);
      }
      for (const id of Object.keys(sources)) {
        if (map.getSource(id)) removeSource(map, id);
        kept.delete(`s:${id}`);
      }
    };
  }, [map, slot, under]);
}

/** How long a layer of what changes over the chart -- weather, traffic,
 *  TFRs -- takes to fade in as its first data comes, rather than snap on. */
const FADE_IN_MS = 250;

/** Each layer type's opacities, the paint a fade sets. */
const OPACITIES: Partial<Record<LayerSpecification["type"], string[]>> = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  raster: ["raster-opacity"],
};

/** The layers (useGlLayer's, called before this) clear as they are added,
 *  then, once `shown` is true, faded to their own opacities over
 *  FADE_IN_MS (at once under reduced motion). The opacities must be
 *  constants or zoom expressions, which MapLibre eases; one that differs
 *  by feature it would only switch. */
export function useGlFadeIn(layers: LayerSpecification[], shown: boolean) {
  const { map } = useGlMap();
  const spec = useRef(layers);
  const state = useRef<"new" | "clear" | "done">("new");
  useEffect(() => {
    const each = (paint: (id: string, prop: string, to: unknown) => void) => {
      for (const layer of spec.current) {
        if (!map.getLayer(layer.id)) continue;
        for (const prop of OPACITIES[layer.type] ?? [])
          paint(layer.id, prop, (layer.paint as Record<string, unknown> | undefined)?.[prop] ?? 1);
      }
    };
    const set = (id: string, k: string, v: unknown) => map.setPaintProperty(id, k as Parameters<MlMap["setPaintProperty"]>[1], v as never);
    const fade = () => {
      if (state.current === "done") return;
      state.current = "done";
      each((id, prop, to) => {
        set(id, `${prop}-transition`, { duration: prefersReducedMotion() ? 0 : FADE_IN_MS, delay: 0 });
        set(id, prop, isDimmed(map.getLayer(id)?.type, prop) ? dimmedOpacity(to) : to);
      });
    };
    if (state.current === "new") {
      state.current = "clear";
      each((id, prop) => {
        set(id, `${prop}-transition`, { duration: 0, delay: 0 });
        set(id, prop, 0);
      });
      // Drawn clear once before the fade, or MapLibre has nothing to ease from.
      if (shown) {
        map.once("render", fade);
        return () => {
          map.off("render", fade);
        };
      }
    }
    if (shown) fade();
  }, [map, shown]);
}

/** A GeoJSON source's data, set as it changes. */
export function useGlData(source: string, data: GeoJSON.GeoJSON | null) {
  const { map } = useGlMap();
  useEffect(() => {
    map.getSource<GeoJSONSource>(source)?.setData(data ?? EMPTY);
    drawnWithData(map, source, data);
  }, [map, source, data]);
}

/** The highest zoom MapLibre has: a layer whose range starts there is
 *  drawn at no level. */
const NO_LEVEL = 24;

/** A source with nothing in it left out of the frame, its layers given no
 *  level to draw at, and their own levels back as data comes. MapLibre
 *  keeps tiles only of a source a drawn layer uses: at rest on a route,
 *  29 of the map's 43 sources were empty (the glide ring, a lesson, the
 *  emergency's, the patterns ...), each tiled and drawn again at every
 *  frame of a pan. Leaving them out took a pan's median frame from 100 to
 *  67 ms and its JavaScript from 1.50 to 1.24 s at CPU 4x (2026-11-18). By zoom range, not
 *  visibility, which the settings set on some of these layers
 *  (AirportWeatherGl). */
export function drawnWithData(map: MlMap, source: string, data: GeoJSON.GeoJSON | null) {
  if (!map.style) return;
  const empty = !data || (data.type === "FeatureCollection" && data.features.length === 0);
  let kept = ranges.get(map);
  if (!kept) ranges.set(map, (kept = new Map()));
  for (const id of map.getLayersOrder()) {
    const layer = map.getLayer(id);
    if (!layer || !("source" in layer) || layer.source !== source) continue;
    const was = kept.get(id);
    if (empty && layer.minzoom !== NO_LEVEL) {
      // A spec with no range reads back as undefined, which
      // setLayerZoomRange would leave as it is: MapLibre's own 0 to 24.
      kept.set(id, [layer.minzoom ?? 0, layer.maxzoom ?? NO_LEVEL]);
      map.setLayerZoomRange(id, NO_LEVEL, NO_LEVEL);
    } else if (!empty && was) {
      kept.delete(id);
      // Given back only if it is still hidden by this: a layer whose range
      // its owner set while it was hidden (AirportWeatherGl's station model
      // from zoom 10) keeps that one, where giving back the range kept
      // before put the station model, its barbs and its "10 SM" on every
      // field at the whole country's zoom (the owner's screenshot,
      // 2026-11-18).
      if (layer.minzoom === NO_LEVEL) map.setLayerZoomRange(id, was[0], was[1]);
    }
  }
}
/** Each hidden layer's own zoom range, to give back. */
const ranges = new WeakMap<MlMap, Map<string, [number, number]>>();

/** Paint properties set on layers as they change: a theme, the night.
 *  Set again whenever the style changes and a layer has not got them: a
 *  layer added after the paint was set (made again from its spec, or not
 *  there yet) came back in its spec's day paint, and in the dark theme
 *  the chart close in was drawn undimmed while the region's level under
 *  it was dimmed (UI audit B10, 2026-11-17). */
export function useGlPaint(layers: string[], paint: Record<string, unknown>) {
  const { map } = useGlMap();
  const key = JSON.stringify(paint);
  const ids = layers.join();
  useEffect(() => {
    const values = Object.entries(JSON.parse(key) as Record<string, unknown>);
    const apply = () => {
      for (const id of ids.split(",")) {
        if (!map.getLayer(id)) continue;
        const type = map.getLayer(id)?.type;
        for (const [k, set] of values) {
          const name = k as Parameters<MlMap["setPaintProperty"]>[1];
          // An opacity keeps the Dimmer's share at night (mapDim).
          const v = isDimmed(type, k) ? dimmedOpacity(set) : set;
          // Only where it differs: setting it changes the style, which
          // would ask for this again.
          if (JSON.stringify(map.getPaintProperty(id, name)) !== JSON.stringify(v)) map.setPaintProperty(id, name, v as never);
        }
      }
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
    // By value: the paint by its JSON, the layers by their names.
  }, [map, key, ids]);
}

/** A tap on this layer's features while mounted; the handler is read at
 *  the tap, so a new one each render costs nothing. */
export function useGlTap(layers: string[], reach: number, rank: number, onTap: GlTap["onTap"]) {
  const { addTap } = useGlMap();
  const handler = useEffectEvent(onTap);
  const ids = layers.join();
  useEffect(() => addTap({ layers: ids.split(","), reach, rank, onTap: (f, e) => handler(f, e) }), [addTap, ids, reach, rank]);
}

/** A tap on the chart that found nothing, while mounted. */
export function useGlMiss(onMiss: (event: MapMouseEvent) => void) {
  const { addMiss } = useGlMap();
  const handler = useEffectEvent(onMiss);
  useEffect(() => addMiss((e) => handler(e)), [addMiss]);
}

export const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
