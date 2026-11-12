import { createContext, useContext, useEffect, useRef, type ReactNode, useEffectEvent } from "react";
import { prefersReducedMotion } from "../../motion";
import type { GeoJSONSource, LayerSpecification, Map as MlMap, MapGeoJSONFeature, MapMouseEvent, SourceSpecification } from "maplibre-gl";

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
  onTap: (feature: MapGeoJSONFeature, event: MapMouseEvent) => void;
  /** Instead of the style's `layers`, a finder of its own: deck.gl's
   *  picking (lib/map/gl/deckLayers useDeckTap). */
  find?: (point: { x: number; y: number }) => MapGeoJSONFeature | null;
}

/** What a tap finds under the finger, within its reach: the nearest
 *  feature of its layers, or what its own finder picks. */
export function tapHit(map: MlMap, tap: GlTap, point: { x: number; y: number }): MapGeoJSONFeature | null {
  if (tap.find) return tap.find(point);
  const layers = tap.layers.filter((l) => map.getLayer(l));
  if (!layers.length) return null;
  const r = tap.reach;
  return (
    map.queryRenderedFeatures(
      [
        [point.x - r, point.y - r],
        [point.x + r, point.y + r],
      ],
      { layers },
    )[0] ?? null
  );
}

export interface GlMapApi {
  map: MlMap;
  addTap: (tap: GlTap) => () => void;
  /** A tap on the chart itself, nothing within reach: what puts a card
   *  away (an airport's, which the page holds). */
  addMiss: (miss: (event: MapMouseEvent) => void) => () => void;
  /** A card in the map's sheet (SheetCard), for what a tap on the map
   *  opens; null puts it away. */
  openCard: (card: ReactNode | null) => void;
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
      if (!map.getLayer(layer.id)) map.addLayer(layer, under && map.getLayer(under) ? under : slotId(slot));
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
        set(id, prop, to);
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
  }, [map, source, data]);
}

/** Paint properties set on layers as they change: a theme, the night. */
export function useGlPaint(layers: string[], paint: Record<string, unknown>) {
  const { map } = useGlMap();
  const key = JSON.stringify(paint);
  const ids = layers.join();
  useEffect(() => {
    const values = JSON.parse(key) as Record<string, unknown>;
    for (const id of ids.split(",")) {
      if (!map.getLayer(id)) continue;
      for (const [k, v] of Object.entries(values)) map.setPaintProperty(id, k as Parameters<MlMap["setPaintProperty"]>[1], v as never);
    }
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

/** A picture that stretches to fit its text (icon-text-fit), its corners
 *  `inset` px each way kept as drawn; or, for a picture with more than
 *  corners to keep (a chip's diamond at its left, a callout's tail under
 *  it), the band each way that stretches and the box the text fills, px
 *  of the picture as drawn. */
export interface Stretch {
  inset: number;
  x?: [number, number];
  y?: [number, number];
  content?: [number, number, number, number];
}

/** A picture ready for addImage: drawn, and its density and stretch. */
export interface DrawnImage {
  /** An SVG drawn (drawSvg), or a canvas's pixels (drawTag). */
  image: HTMLImageElement | ImageData;
  options: { pixelRatio: number; stretchX?: [number, number][]; stretchY?: [number, number][]; content?: [number, number, number, number] };
}

/** A stretch in the picture's pixels, at its density. */
function stretchOf(
  stretch: Stretch,
  w: number,
  h: number,
  ratio: number,
): Pick<DrawnImage["options"], "stretchX" | "stretchY" | "content"> {
  const { inset } = stretch;
  const s = (v: number) => v * ratio;
  const [x0, x1] = stretch.x ?? [inset, w - inset];
  const [y0, y1] = stretch.y ?? [inset, h - inset];
  const box = stretch.content ?? [inset, inset, w - inset, h - inset];
  return { stretchX: [[s(x0), s(x1)]], stretchY: [[s(y0), s(y1)]], content: box.map(s) as [number, number, number, number] };
}

/** A picture's SVG markup drawn at the screen's density (up to three
 *  pixels a point), with its stretch for icon-text-fit; null where it
 *  cannot be drawn. */
export function drawSvg(svg: string, stretch?: Stretch): Promise<DrawnImage | null> {
  const ratio = Math.max(1, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
  return new Promise((resolve) => {
    const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 24),
      h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 24);
    const sized = svg
      .replace(`width="${w}"`, `width="${w * ratio}"`)
      .replace(`height="${h}"`, `height="${h * ratio}"`)
      .replace(/^<svg (?!xmlns)/, `<svg xmlns="http://www.w3.org/2000/svg" `);
    const image = new Image(w * ratio, h * ratio);
    image.onload = () => {
      // A label's box (icon-text-fit) stretches between its corners.
      const fit = stretch && stretchOf(stretch, w, h, ratio);
      resolve({ image, options: { pixelRatio: ratio, ...fit } });
    };
    // A picture that cannot be drawn leaves its symbol bare, not the
    // layer waiting.
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  });
}
