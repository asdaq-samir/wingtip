import { useEffect, useState } from "react";
import { aheadOf, within, type Box } from "../view";
import { useGlMap } from "./glLayer";
import { leafletZoomOf } from "./glStyle";

/** The whole level a zoom is at: every layer draws by whole levels
 *  (zoom >= FROM_ZOOM), the same under a pinch as at rest. */
export const levelOf = (zoom: number) => Math.floor(zoom + 1e-9);

export interface GlView {
  /** The view and a screen round it on the half-degree grid (aheadOf):
   *  what the overlays ask the planner for, each box asked once and
   *  cached. */
  box: Box;
  /** The whole level the map is at, in the app's levels (Leaflet's, which
   *  every layer's FROM_ZOOM is written in: MapLibre's zoom plus one). */
  level: number;
}

/** The view as it is now, also while a pinch or a pan is under way (the
 *  owner, 2026-11-07: the overlays should follow the zoom as ForeFlight's
 *  do, not wait for the pinch to end). It changes only when the whole
 *  level changes or the view leaves the box already asked for, at most
 *  once a frame, so a gesture costs a render at each level and each new
 *  box, not each frame. A box already asked for keeps being the answer
 *  while the view stays inside it and it is not much bigger than the
 *  view would ask for now (view.ts within). The layers keep their last
 *  answer on screen while the next is fetched (placeholderData). */
export function useGlView(): GlView {
  const { map } = useGlMap();
  const [view, setView] = useState<GlView>(() => ({ box: aheadOf(map.getBounds()), level: levelOf(leafletZoomOf(map.getZoom())) }));
  useEffect(() => {
    let frame = 0;
    const look = () => setView(was => {
      const bounds = map.getBounds();
      const box = within(bounds, was.box) ? was.box : aheadOf(bounds);
      const level = levelOf(leafletZoomOf(map.getZoom()));
      return box === was.box && level === was.level ? was : { box, level };
    });
    const moved = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; look(); });
    };
    map.on("move", moved);
    map.on("moveend", look);
    return () => { map.off("move", moved); map.off("moveend", look); cancelAnimationFrame(frame); };
  }, [map]);
  return view;
}
