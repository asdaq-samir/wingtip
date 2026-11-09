// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import type { Map as GlMap, Marker } from "maplibre-gl";
import { declutter, ROUTE_PRIORITY } from "./declutter";

/** A marker drawn `w` by `h` at (x, y) on the screen, moved by its offset. */
function fakeMarker(x: number, y: number, w = 24, h = 24): Marker {
  const el = document.createElement("div");
  let offset: [number, number] = [0, 0];
  el.getBoundingClientRect = () => ({
    left: x + offset[0],
    top: y + offset[1],
    right: x + offset[0] + w,
    bottom: y + offset[1] + h,
    width: w,
    height: h,
    x,
    y,
    toJSON: () => ({}),
  });
  const marker = {
    getElement: () => el,
    setOffset: (o: [number, number]) => {
      offset = o;
      return marker;
    },
    getOffset: () => ({ x: offset[0], y: offset[1] }),
  };
  return marker as unknown as Marker;
}

function fakeMap(): GlMap & { rest: () => void } {
  const ends: (() => void)[] = [];
  const container = document.createElement("div");
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 390,
    bottom: 844,
    width: 390,
    height: 844,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return {
    on: (_: string, f: () => void) => ends.push(f),
    getContainer: () => container,
    rest: () => ends.forEach((f) => f()),
  } as unknown as GlMap & { rest: () => void };
}

describe("the route's marks give way by priority", () => {
  test("the destination's ident stays, a checkpoint's badge on it is left out, a top of climb's pill moves clear", () => {
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => {
      f();
      return 1;
    });
    const map = fakeMap();
    const dest = fakeMarker(100, 100, 48, 20);
    const badge = fakeMarker(110, 104);
    const neighbour = fakeMarker(300, 300);
    const toc = fakeMarker(305, 302, 30, 16);
    declutter(map, { marker: dest, priority: ROUTE_PRIORITY.destination, offset: [0, 0] });
    declutter(map, { marker: badge, priority: ROUTE_PRIORITY.checkpoint - 0.005, offset: [0, 0] });
    declutter(map, { marker: neighbour, priority: ROUTE_PRIORITY.checkpoint - 0.004, offset: [0, 0] });
    declutter(map, { marker: toc, priority: ROUTE_PRIORITY.legPoint, offset: [0, 0], nudge: true });
    map.rest();
    expect(dest.getElement().style.visibility).toBe("");
    expect(badge.getElement().dataset.declutter).toBe("hidden");
    expect(neighbour.getElement().style.visibility).toBe("");
    expect(toc.getElement().dataset.declutter).toBe("moved");
    expect(toc.getOffset()).toEqual({ x: 0, y: -20 });
    vi.unstubAllGlobals();
  });

  test("of two badges that meet, the one flown to first stays", () => {
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => {
      f();
      return 1;
    });
    const map = fakeMap();
    const third = fakeMarker(200, 200),
      fourth = fakeMarker(210, 205);
    declutter(map, { marker: fourth, priority: ROUTE_PRIORITY.checkpoint - 0.004, offset: [0, 0] });
    declutter(map, { marker: third, priority: ROUTE_PRIORITY.checkpoint - 0.003, offset: [0, 0] });
    map.rest();
    expect(third.getElement().style.visibility).toBe("");
    expect(fourth.getElement().style.visibility).toBe("hidden");
    vi.unstubAllGlobals();
  });
});
