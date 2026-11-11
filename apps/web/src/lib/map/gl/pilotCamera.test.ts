import { describe, expect, it } from "vitest";
import type { Map as GlMap } from "maplibre-gl";
import { picked, pilotMoved, watchPilotMoves } from "./pilotCamera";

/** A map that only keeps its movestart listeners, to fire by hand. */
function fakeMap() {
  const listeners = new Set<(e: { originalEvent?: unknown }) => void>();
  const map = {
    on: (_: string, f: (e: { originalEvent?: unknown }) => void) => listeners.add(f),
    off: (_: string, f: (e: { originalEvent?: unknown }) => void) => listeners.delete(f),
  } as unknown as GlMap;
  return { map, move: (e: { originalEvent?: unknown }) => listeners.forEach((f) => f(e)) };
}

describe("pilotCamera", () => {
  it("is the pilot's after a move by hand, and the app's again after a pick", () => {
    const { map, move } = fakeMap();
    const stop = watchPilotMoves(map);
    picked();
    // The app's own camera moves carry no originalEvent.
    move({});
    expect(pilotMoved()).toBe(false);
    move({ originalEvent: new Event("mousedown") });
    expect(pilotMoved()).toBe(true);
    picked();
    expect(pilotMoved()).toBe(false);
    stop();
    move({ originalEvent: new Event("mousedown") });
    expect(pilotMoved()).toBe(false);
  });
});
