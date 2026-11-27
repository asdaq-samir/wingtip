// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { Map as MlMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { usePlacedFieldRings } from "./placedRings";

const LAYERS = ["airports"];

/** As much of a MapLibre map as the rings' keeper touches: the symbols
 *  placed at a rest are `drawn`, the route's own fields `own`. `rest` is a
 *  move's end and the idle after it; `idle` an idle alone (a frame drawn
 *  at rest); `tile` a tile of a source come in. */
function fakeMap() {
  const drawn = { now: [] as string[], own: [] as string[] };
  const on = new Map<string, Set<(e?: unknown) => void>>();
  const fire = (name: string, e?: unknown) => on.get(name)?.forEach((f) => f(e));
  const map = {
    style: {},
    getSource: () => ({}),
    getLayer: () => ({}),
    on: (name: string, f: () => void) => on.set(name, (on.get(name) ?? new Set()).add(f)),
    off: (name: string, f: () => void) => on.get(name)?.delete(f),
    queryRenderedFeatures: vi.fn(() => drawn.now.map((faa_id) => ({ properties: { faa_id } }))),
    querySourceFeatures: () => drawn.own.map((faa_id) => ({ properties: { faa_id } })),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    setGlobalStateProperty: vi.fn(),
  };
  const rest = () => {
    fire("moveend");
    fire("idle");
  };
  const idle = () => fire("idle");
  const tile = (sourceId: string) => fire("sourcedata", { sourceId, tile: {} });
  const states = () => map.setFeatureState.mock.calls.map(([f, s]) => `${(f as { id: string }).id}:${(s as { placed: boolean }).placed}`);
  return { map, drawn, rest, idle, tile, states };
}

describe("the Class C and D rings kept to their fields", () => {
  it("set only the fields whose placing changed at a rest, never reading the rings", () => {
    const { map, drawn, rest, states } = fakeMap();
    drawn.now = ["MSN", "RFD"];
    renderHook(() => usePlacedFieldRings(map as unknown as MlMap, "rings", "fields", LAYERS, []));
    expect(states()).toEqual(["MSN:true", "RFD:true"]);
    map.setFeatureState.mockClear();
    drawn.now = ["MSN", "MKE"];
    rest();
    expect(states()).toEqual(["MKE:true", "RFD:false"]);
    map.setFeatureState.mockClear();
    rest();
    expect(states()).toEqual([]);
  });

  it("set the map's state once, not again as the route's fields change", () => {
    const { map, drawn, states } = fakeMap();
    const { rerender } = renderHook(({ own }) => usePlacedFieldRings(map as unknown as MlMap, "rings", "fields", LAYERS, own), {
      initialProps: { own: [] as string[] },
    });
    expect(map.setGlobalStateProperty).toHaveBeenCalledOnce();
    // A route's edit adds a field: its ring drawn at once, no state reset.
    drawn.own = ["OSH"];
    rerender({ own: ["KOSH"] });
    expect(map.setGlobalStateProperty).toHaveBeenCalledOnce();
    expect(states()).toEqual(["OSH:true"]);
  });

  it("look again only at a rest after a move or a tile, not at every idle", () => {
    const { map, drawn, rest, idle, tile, states } = fakeMap();
    drawn.now = ["MSN"];
    renderHook(() => usePlacedFieldRings(map as unknown as MlMap, "rings", "fields", LAYERS, []));
    // The mount's look, then its first idle.
    idle();
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(2);
    // Frames at rest (traffic's updates, a paint): no look.
    idle();
    idle();
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(2);
    // Another source's tile: none either.
    tile("traffic");
    idle();
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(2);
    // The fields' tile laid out again: one look at the next idle.
    drawn.now = ["MSN", "RFD"];
    tile("fields");
    idle();
    expect(states()).toContain("RFD:true");
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(3);
    rest();
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(4);
  });
});
