import type { GeoJSONSource, MapGeoJSONFeature, Map as MlMap, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { EMPTY, drawSvg, useGlFadeIn, useGlLayer, useGlMap, type DrawnImage, type Slot, type Stretch } from "./glLayer";
import { TAP } from "./layers/common";
import { useGlProbe } from "./useGlProbe";

/** A picture a mark wears, by its image id: drawn once a map, when a mark
 *  first needs it. */
export interface GlPicture {
  id: string;
  draw: () => Promise<DrawnImage | null>;
}

/** A picture from SVG markup (glLayer's drawSvg), stretched to its text
 *  where `stretch` says. */
export const svgPicture = (id: string, svg: () => string, stretch?: Stretch): GlPicture => ({ id, draw: () => drawSvg(svg(), stretch) });

/** A picture already in the map's own set (glOverlays' overlayPictures,
 *  which the map takes in as a layer asks): nothing to draw. */
export const stylePicture = (id: string): GlPicture => ({ id, draw: () => Promise.resolve(null) });

/** A mark of the app's over the chart: its point, its picture and its
 *  words, which the layers' expressions read (`icon`, `text`), and any
 *  other properties they read (a colour, a turn) or a test does. */
export interface GlSymbol {
  key: string;
  lat: number;
  lon: number;
  picture?: GlPicture;
  /** Pictures its layers name outright (a field's ident pill beside its
   *  mark), drawn with its own. */
  also?: GlPicture[];
  text?: string;
  props?: Record<string, string | number | boolean | null>;
  onTap?: () => void;
  /** The pointer over it and off it again (a field's terminal sheet). */
  onHover?: (on: boolean) => void;
}

interface Options {
  /** Where among the map's slots: over everything by default, as the
   *  marks drawn as HTML were. */
  slot?: Slot;
  /** Under this layer where the map has it: a mark of lower priority
   *  under a higher one, so MapLibre places the higher first. */
  under?: string;
  /** Its taps' order among the map's (common's TAP.rank). */
  rank?: number;
  /** Faded in as the first marks come (what changes: the weather). */
  fade?: boolean;
}

const drawn = new WeakMap<MlMap, Map<string, Promise<void>>>();

/** The picture in the map's images, drawn once a map. */
function addPicture(map: MlMap, picture: GlPicture): Promise<void> {
  let kept = drawn.get(map);
  if (!kept) drawn.set(map, (kept = new Map()));
  let done = kept.get(picture.id);
  if (!done) {
    done = map.hasImage(picture.id)
      ? Promise.resolve()
      : picture.draw().then((d) => {
          if (d && map.style && !map.hasImage(picture.id)) map.addImage(picture.id, d.image, d.options);
        });
    kept.set(picture.id, done);
  }
  return done;
}

const NO_LAYERS: SymbolLayerSpecification[] = [];

/**
 * The app's own marks over the chart -- a route's fields and numbered
 * checkpoints, a top of climb, the weather's chips, a stop's pins -- as
 * MapLibre symbol layers from one GeoJSON source: each mark's picture (a
 * chip's stretched to its words by icon-text-fit), its words in the
 * style's Inter, and MapLibre's own collision, priority
 * (symbol-sort-key) and placement (text-variable-anchor) where the layers
 * ask for them. Its pictures are drawn before the marks are given to the
 * map, so none is laid out bare. A tap goes to the nearest tappable mark
 * within a finger's reach (the map's one tap, GlTap); what is drawn is
 * the probe's `data-<source>` for the browser tests (useGlProbe).
 */
export function useGlSymbols(source: string, layers: SymbolLayerSpecification[], symbols: GlSymbol[], options: Options = {}) {
  const { slot = "top", under, rank = TAP.rank.mark, fade = false } = options;
  const { map, addTap } = useGlMap();
  useGlLayer(slot, { [source]: { type: "geojson", data: EMPTY } }, layers, under);
  useGlFadeIn(fade ? layers : NO_LAYERS, symbols.length > 0);
  const byKey = useRef(new Map<string, GlSymbol>());
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: symbols.map((s) => ({
        type: "Feature",
        properties: { ...s.props, key: s.key, icon: s.picture?.id ?? "", text: s.text ?? "", tap: !!s.onTap },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      })),
    }),
    [symbols],
  );
  useEffect(() => {
    byKey.current = new Map(symbols.map((s) => [s.key, s]));
    let live = true;
    const pictures = new Map(symbols.flatMap((s) => [...(s.picture ? [s.picture] : []), ...(s.also ?? [])]).map((p) => [p.id, p] as const));
    void Promise.all([...pictures.values()].map((p) => addPicture(map, p))).then(() => {
      if (live && map.style) map.getSource<GeoJSONSource>(source)?.setData(data);
    });
    return () => {
      live = false;
    };
  }, [map, source, symbols, data]);

  const ids = layers.map((l) => l.id).join();
  const tappable = symbols.some((s) => s.onTap);
  useEffect(() => {
    if (!tappable) return;
    const of = ids.split(",");
    return addTap({
      layers: of,
      reach: TAP.mark,
      rank,
      onTap: (f) => byKey.current.get(String(f.properties.key))?.onTap?.(),
      // Only the marks a tap opens, the nearest within a finger (tapHit).
      filter: ["==", ["get", "tap"], true],
    });
  }, [addTap, ids, rank, tappable]);

  // The pointer: a hand over a mark a tap opens, and its hover.
  const hovers = tappable || symbols.some((s) => s.onHover);
  useEffect(() => {
    if (!hovers) return;
    const of = ids.split(",");
    let over: string | null = null;
    const leave = () => {
      if (over === null) return;
      byKey.current.get(over)?.onHover?.(false);
      over = null;
      map.getCanvas().style.cursor = "";
    };
    const move = (e: { features?: MapGeoJSONFeature[] }) => {
      const key = String(e.features?.[0]?.properties.key);
      if (key === over) return;
      leave();
      over = key;
      const mark = byKey.current.get(key);
      if (mark?.onTap) map.getCanvas().style.cursor = "pointer";
      mark?.onHover?.(true);
    };
    for (const id of of) {
      map.on("mousemove", id, move);
      map.on("mouseleave", id, leave);
    }
    return () => {
      for (const id of of) {
        map.off("mousemove", id, move);
        map.off("mouseleave", id, leave);
      }
      leave();
    };
  }, [map, ids, hovers]);

  // What MapLibre placed (a mark its collision left out is not), for the
  // browser tests: each mark's key, words and properties, and its point.
  useGlProbe(source, ids.split(","), (f) => {
    const { icon: _icon, tap: _tap, ...rest } = f.properties;
    return rest;
  });
}
