import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { aheadOf, within, type Box } from "../view";
import { useGlMap } from "./glLayer";
import { appZoomOf } from "./glStyle";

/** The whole level a zoom is at: every layer draws by whole levels
 *  (zoom >= FROM_ZOOM), the same under a pinch as at rest. */
const levelOf = (zoom: number) => Math.floor(zoom + 1e-9);

interface GlView<B> {
  /** What the layer asks for the view by: by default the view and a
   *  screen round it on the half-degree grid (aheadOf), each box asked
   *  once and cached; else what the layer's own box function makes of the
   *  map (a weather grid's box, the obstacles' degree round the middle). */
  box: B;
  /** The whole level the map is at, in the app's levels, which every
   *  layer's FROM_ZOOM is written in: MapLibre's zoom plus one (glStyle). */
  level: number;
}

/** A layer's box for the map as it is now, given the last one (to keep
 *  it while it still serves). */
export type GlBoxOf<B> = (map: MlMap, was: B | undefined) => B;

/** A box already asked for keeps being the answer while the view stays
 *  inside it and it is not much bigger than the view would ask for now
 *  (view.ts within). */
const ahead: GlBoxOf<Box> = (map, was) => {
  const bounds = map.getBounds();
  return was && within(bounds, was) ? was : aheadOf(bounds);
};

/** The same box: the same object, or one written the same (a box
 *  function's fresh object for the same edges). */
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The view as state, for the layers that ask the planner for it. By
 *  default as it is now, also while a pinch or a pan is under way (the
 *  owner, 2026-11-07: the overlays should follow the zoom as ForeFlight's
 *  do, not wait for the pinch to end), at most once a frame; with `at`
 *  "rest", only as the camera comes to rest (the obstacles, the weather's
 *  grid, the 3D airspace, a screen reader's list of fields). It changes
 *  only when the whole level or the box changes, so a gesture costs a
 *  render at each level and each new box, not each frame. The layers keep
 *  their last answer on screen while the next is fetched
 *  (placeholderData). */
export function useGlView(): GlView<Box>;
export function useGlView<B>(boxOf: GlBoxOf<B>, at?: "move" | "rest"): GlView<B>;
export function useGlView<B>(boxOf: GlBoxOf<B> = ahead as unknown as GlBoxOf<B>, at: "move" | "rest" = "move"): GlView<B> {
  const { map } = useGlMap();
  const [view, setView] = useState<GlView<B>>(() => ({ box: boxOf(map, undefined), level: levelOf(appZoomOf(map.getZoom())) }));
  // The view last set, which the box function is given again.
  const kept = useRef(view);
  const read = useEffectEvent((was: B) => boxOf(map, was));
  useEffect(() => {
    let frame = 0;
    const look = () => {
      const was = kept.current;
      const box = read(was.box);
      const level = levelOf(appZoomOf(map.getZoom()));
      if (same(box, was.box) && level === was.level) return;
      kept.current = { box: same(box, was.box) ? was.box : box, level };
      setView(kept.current);
    };
    const moved = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        look();
      });
    };
    if (at === "move") map.on("move", moved);
    map.on("moveend", look);
    return () => {
      map.off("move", moved);
      map.off("moveend", look);
      cancelAnimationFrame(frame);
    };
  }, [map, at]);
  return view;
}
