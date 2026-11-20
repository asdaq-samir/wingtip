import { useEffect, useEffectEvent } from "react";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import type { Layer } from "@deck.gl/core";
import type { IControl, Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { rgbOf } from "../../rgb";
import { slotId, useGlMap, type GlTap } from "./glLayer";

/**
 * deck.gl's layers on the map, interleaved into its own style: deck.gl's
 * MapLibre package (@deck.gl/maplibre's MapLibreOverlay, which deck.gl's
 * docs give MapLibre 5 and 6), one overlay a map -- it allows no second
 * interleaved one -- shared by everything drawn with deck.gl: the weather
 * flow (features/weather-flow/FlowGl) and the 3D view's airspace, route
 * and approach (features/plan-map/terrain). Each part gives its layers
 * under a key of its own, and puts each where it belongs in the map's
 * slots with the layer's own `beforeId` (deckSlot). The overlay reads the
 * map's camera, the 3D ground's height at its centre among it, through
 * MapLibre's own API, so a height given in metres above the sea is drawn
 * there, over the ground or under it.
 *
 * Loaded only by the parts that draw with it, each a chunk of its own:
 * none of deck.gl is in the map's first script.
 */

interface Held {
  overlay: MapLibreOverlay;
  sets: Map<string, Layer[]>;
}

const held = new WeakMap<MlMap, Held>();

const draw = (h: Held) => h.overlay.setProps({ layers: [...h.sets.values()].flat() });

/** `layers` drawn on the map while mounted, under `key`: a new array
 *  replaces the last, as deck.gl diffs layers by id. Registering a key and
 *  updating its layers are two effects: the overlay is made when the first
 *  key comes and taken off when the last goes, and a new array only sets
 *  the living overlay's layers. Made anew on each update (as it was), the
 *  overlay dropped every deck.gl layer for a frame and rebuilt its GPU
 *  state, the 3D airspace's flicker after a pan (2026-11-14). */
export function useDeckLayers(key: string, layers: Layer[]) {
  const { map } = useGlMap();
  useEffect(() => {
    let h = held.get(map);
    if (!h) {
      // No picking but the map's one tap's (useDeckTap, which turns it on
      // for its own pick): nothing of ours hovers, clicks or drags through
      // deck.gl, and its own pointer handling picked under the pointer at
      // every move and press, a readPixels each that waits for the whole
      // 3D frame. On a software renderer a drag across the 3D airspace
      // took 40 s, 6.9 of them in that wait (airspace-3d.spec on CI).
      // deck.gl's `_pickable` (DeckProps, experimental) is the switch.
      const overlay = new MapLibreOverlay({ interleaved: true, layers: [], _pickable: false });
      h = { overlay, sets: new Map() };
      held.set(map, h);
      map.addControl(h.overlay as unknown as IControl);
    }
    const mine = h;
    return () => {
      mine.sets.delete(key);
      if (mine.sets.size) return draw(mine);
      held.delete(map);
      if (map.style) map.removeControl(mine.overlay as unknown as IControl);
    };
  }, [map, key]);
  useEffect(() => {
    const h = held.get(map);
    if (!h) return;
    h.sets.set(key, layers);
    draw(h);
  }, [map, key, layers]);
}

/** A deck.gl layer's place in the map's style, as a style layer's slot
 *  (lib/map/gl/glLayer SLOTS): under the slot's own empty layer. A prop
 *  of @deck.gl/maplibre's the layers' own types do not list, so spread. */
export const deckSlot = (slot: "areas" | "lines" | "route" | "marks"): { beforeId: string } => ({ beforeId: slotId(slot) });

/** A colour of the tokens as deck.gl takes it: [r, g, b, a], 0 to 255,
 *  from "#rrggbb" and how opaque, 0 to 1. */
export function deckColour(hex: string, alpha = 1): [number, number, number, number] {
  return [...rgbOf(hex), Math.round(alpha * 255)];
}

/** A tap on deck.gl's layers `layerIds` while mounted, in the map's one
 *  tap (GlMapShell) at `rank` as a style layer's would be: deck.gl's own
 *  picking finds the object under the finger, `reach` px round it, and
 *  `onTap` is given it as the GeoJSON feature it was drawn from. */
export function useDeckTap(layerIds: string[], reach: number, rank: number, onTap: GlTap["onTap"]) {
  const { map, addTap } = useGlMap();
  const handler = useEffectEvent(onTap);
  const ids = layerIds.join();
  useEffect(
    () =>
      addTap({
        layers: [],
        reach,
        rank,
        onTap: (f, e) => handler(f, e),
        find: (point) => {
          const overlay = held.get(map)?.overlay;
          if (!overlay) return null;
          // Picking on for this pick alone (useDeckLayers keeps it off).
          overlay.setProps({ _pickable: true });
          try {
            const info = overlay.pickObject({ x: point.x, y: point.y, radius: reach, layerIds: ids.split(",") });
            return (info?.object as MapGeoJSONFeature | undefined) ?? null;
          } finally {
            overlay.setProps({ _pickable: false });
          }
        },
      }),
    [map, addTap, ids, reach, rank],
  );
}
