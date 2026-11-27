// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { Map as MlMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { usePlacedFieldRings } from "./placedRings";

const LAYERS = ["airports"];

/** As much of a MapLibre map as the rings' keeper touches: the symbols
 *  placed at a rest are `drawn`, the route's own fields `own`. */
function fakeMap() {
  const drawn = { now: [] as string[], own: [] as string[] };
  const idle = new Set<() => void>();
  const map = {
    style: {},
    getSource: () => ({}),
    getLayer: () => ({}),
    on: (_: string, f: () => void) => idle.add(f),
    off: (_: string, f: () => void) => idle.delete(f),
    queryRenderedFeatures: () => drawn.now.map((faa_id) => ({ properties: { faa_id } })),
    querySourceFeatures: () => drawn.own.map((faa_id) => ({ properties: { faa_id } })),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    setGlobalStateProperty: vi.fn(),
  };
  const rest = () => idle.forEach((f) => f());
  const states = () => map.setFeatureState.mock.calls.map(([f, s]) => `${(f as { id: string }).id}:${(s as { placed: boolean }).placed}`);
  return { map, drawn, rest, states };
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
});
