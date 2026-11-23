import type { Map as GlMap } from "maplibre-gl";

/**
 * What a MapLibre map's canvas shows, readable for a copy of it. A WebGL
 * canvas without preserveDrawingBuffer (MapLibre's default, kept: it costs
 * every frame) reads back blank once its frame is on the screen, in Safari
 * as in Chrome, so a card's still copy on its close (useCardFrame's
 * keepFace) drew the airport diagram, the plate beside the map and a
 * chart's pages as nothing (the r6-ui audit's M3). A map put here is drawn
 * again at once, in the same task, as its canvas is read: the frame is
 * still in its buffer then.
 */
const maps = new WeakMap<HTMLCanvasElement, GlMap>();

/** The map's canvas readable by `drawnFace` for the map's life. */
export function keepFaceReadable(map: GlMap): void {
  maps.set(map.getCanvas(), map);
}

/** The canvas as a source to draw from: a map's drawn again first. */
export function drawnFace(canvas: HTMLCanvasElement): HTMLCanvasElement {
  maps.get(canvas)?.redraw();
  return canvas;
}
