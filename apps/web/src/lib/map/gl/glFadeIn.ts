import type { LayerSpecification, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../motion";
import { useGlMap } from "./glLayer";
import { MAP_DIM, dimmedPaint } from "./mapDim";

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
 *  by feature it would only switch. An opacity the Dimmer reaches (mapDim)
 *  eases to its share now as a plain figure, and is tied to the Dimmer's
 *  global state once in, the same value, so nothing is seen to change: the
 *  fade never rides on the global state's own reading. */
export function useGlFadeIn(layers: LayerSpecification[], shown: boolean) {
  const { map } = useGlMap();
  const spec = useRef(layers);
  const state = useRef<"new" | "clear" | "done">("new");
  // The tie to the Dimmer, kept through a change of `shown`, dropped only with the layers.
  const tie = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(tie.current), []);
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
      const ms = prefersReducedMotion() ? 0 : FADE_IN_MS;
      const now = Number(map.getGlobalState()[MAP_DIM] ?? 1);
      each((id, prop, to) => {
        set(id, `${prop}-transition`, { duration: ms, delay: 0 });
        set(id, prop, dimmedPaint(map.getLayer(id), prop, to, now));
      });
      tie.current = setTimeout(() => {
        if (map.style) each((id, prop, to) => set(id, prop, dimmedPaint(map.getLayer(id), prop, to)));
      }, ms);
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
