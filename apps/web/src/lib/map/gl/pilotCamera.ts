import type { Map as GlMap } from "maplibre-gl";

/**
 * Whose the camera is, as Apple Maps keeps it (the owner, 2026-11-11: "I
 * like the stock behavior"): the map moves itself only for something the
 * pilot picked -- a place or a result tapped, a route made, the location
 * arrow -- and once the pilot has moved it by hand (a drag, a pinch, a
 * turn: a MapLibre move with its `originalEvent`), nothing moves it again
 * until they next pick something. A module flag rather than a store: no
 * view draws from it, the camera's movers read it as they would move.
 */
let movedByHand = false;

/** Whether the pilot has moved the map by hand since they last picked
 *  something. */
export function pilotMoved(): boolean {
  return movedByHand;
}

/** Something picked: the map is the app's to bring to it again. */
export function picked(): void {
  movedByHand = false;
}

/** The pilot's own moves of `map` watched; the returned function stops it. */
export function watchPilotMoves(map: GlMap): () => void {
  const moved = (e: { originalEvent?: unknown }) => {
    if (e.originalEvent) movedByHand = true;
  };
  map.on("movestart", moved);
  return () => {
    map.off("movestart", moved);
  };
}
