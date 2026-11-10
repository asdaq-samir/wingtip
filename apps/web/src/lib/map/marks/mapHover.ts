import { create } from "zustand";

type Point = { lat: number; lon: number };

/**
 * What the pointer rests on in a list that the map also draws, for the map
 * to light it (docs/design/web.md, Hover: desktop only): a leg of the
 * route (the nav log's row, as `[from, to]`) and a TFR by its NOTAM id
 * (the Brief's row). Set only for a mouse's pointer: a finger has no hover,
 * and its tap does what it always did. Nothing here moves the map.
 */
export const useMapHover = create<{ leg: Point[] | null; tfr: string | null }>(() => ({ leg: null, tfr: null }));

/** The pointer on a leg's row, or off it (null). */
export const hoverLeg = (leg: Point[] | null) => useMapHover.setState({ leg });

/** The pointer on a TFR's row, or off it (null). */
export const hoverTfr = (tfr: string | null) => useMapHover.setState({ tfr });

/** A row's pointer handlers that light its thing on the map while a mouse
 *  rests on it: `on` and `off` for its enter and leave. */
export function mouseHover(on: () => void, off: () => void) {
  return {
    onPointerEnter: (e: { pointerType: string }) => {
      if (e.pointerType === "mouse") on();
    },
    onPointerLeave: (e: { pointerType: string }) => {
      if (e.pointerType === "mouse") off();
    },
  };
}
