import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as GlMap } from "maplibre-gl";
import { useOwnShip } from "../position/ownShip";
import { useTracking } from "../position/tracking";
import { cameraOf } from "./camera";

type Listener = (e: { originalEvent?: unknown }) => void;

/**
 * A map 400 by 800 with no padding, a degree a hundred pixels, that keeps
 * the camera calls made of it and is moving while the test says so.
 */
function fakeMap() {
  const listeners = new Map<string, Set<Listener>>();
  const calls: { name: string; options: Record<string, unknown> }[] = [];
  const state = { center: { lng: 0, lat: 0 }, zoom: 8, moving: false };
  const record =
    (name: string) =>
    (a: unknown, b?: unknown): void => {
      calls.push({ name, options: (b ?? a ?? {}) as Record<string, unknown> });
      state.moving = name !== "jumpTo" && name !== "setPadding";
    };
  const map = {
    on: (type: string, f: Listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(f)),
    off: (type: string, f: Listener) => listeners.get(type)?.delete(f),
    getContainer: () => ({ getBoundingClientRect: () => ({ width: 400, height: 800 }), clientWidth: 400, clientHeight: 800 }),
    getPadding: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getCenter: () => ({ ...state.center, toArray: () => [state.center.lng, state.center.lat] }),
    getZoom: () => state.zoom,
    isMoving: () => state.moving,
    project: (p: [number, number] | { lng: number; lat: number }) => {
      const [lng, lat] = Array.isArray(p) ? p : [p.lng, p.lat];
      return { x: 200 + (lng - state.center.lng) * 100, y: 400 - (lat - state.center.lat) * 100 };
    },
    unproject: ([x, y]: [number, number]) => ({ lng: state.center.lng + (x - 200) / 100, lat: state.center.lat - (y - 400) / 100 }),
    cameraForBounds: () => ({ center: [1, 1], zoom: 7 }),
    easeTo: record("easeTo"),
    flyTo: record("flyTo"),
    jumpTo: record("jumpTo"),
    fitBounds: record("fitBounds"),
    setPadding: record("setPadding"),
  } as unknown as GlMap;
  const fire = (type: string, e: { originalEvent?: unknown } = {}) => listeners.get(type)?.forEach((f) => f(e));
  return { map, calls, state, fire };
}

let frames: FrameRequestCallback[] = [];
const nextFrame = () => {
  const run = frames;
  frames = [];
  run.forEach((f) => f(performance.now()));
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
  useOwnShip.setState({ enabled: true, follow: true });
  useTracking.setState({ follow: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ease = { duration: 300, easing: (t: number) => t };

describe("the camera's one owner", () => {
  it("lets a follow wait behind a pick under way, then follows with one linear ease (FL-7)", () => {
    const { map, calls } = fakeMap();
    const camera = cameraOf(map);
    camera.pick([1, 1], { zoom: 9, duration: 800, keeps: "track" });
    expect(calls.map((c) => c.name)).toEqual(["easeTo"]);
    // The tracking kept on, own ship's follow ended by the pick.
    expect(useTracking.getState().follow).toBe(true);
    expect(useOwnShip.getState().follow).toBe(false);
    camera.follow("track", [1.5, 1]);
    nextFrame();
    expect(calls).toHaveLength(1);
  });

  it("gives the camera to a fit asked in the same frame as a follow's step (FL-22)", () => {
    const { map, calls } = fakeMap();
    const camera = cameraOf(map);
    camera.follow("own-ship", [0.5, 0.5]);
    camera.fit(
      [
        [-2, -2],
        [2, 2],
      ],
      { margin: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1000 },
    );
    nextFrame();
    expect(calls.map((c) => c.name)).toEqual(["fitBounds"]);
  });

  it("moves for the latest of a follow's points in a frame, over the time between them, and not for one under a pixel off (FL-13)", () => {
    const { map, calls, state } = fakeMap();
    const camera = cameraOf(map);
    camera.follow("dry-run", [0.2, 0]);
    camera.follow("dry-run", [0.4, 0]);
    nextFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options.center).toEqual([0.4, 0]);
    expect((calls[0]!.options.easing as (t: number) => number)(0.5)).toBe(0.5);
    state.center = { lng: 0.4, lat: 0 };
    camera.follow("dry-run", [0.401, 0]);
    nextFrame();
    expect(calls).toHaveLength(1);
  });

  it("keeps a tracked airplane where it is on the screen, moving the map by its own move, not drawing it to the middle", () => {
    const { map, calls } = fakeMap();
    const camera = cameraOf(map);
    camera.follow("track", [1, 1], { keep: "place" });
    nextFrame();
    // Its first point only marks where it is.
    expect(calls).toHaveLength(0);
    camera.follow("track", [1.5, 1], { keep: "place" });
    nextFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options.center).toEqual([0.5, 0]);
  });

  it("ends every follow at a drag and at a tap, not at a pinch", () => {
    const { map, fire } = fakeMap();
    const camera = cameraOf(map);
    fire("movestart", { originalEvent: new Event("wheel") });
    expect(useOwnShip.getState().follow).toBe(true);
    fire("dragstart", { originalEvent: new Event("mousedown") });
    expect(useOwnShip.getState().follow).toBe(false);
    expect(useTracking.getState().follow).toBe(false);
    useOwnShip.setState({ follow: true });
    camera.tapped();
    expect(useOwnShip.getState().follow).toBe(false);
  });

  it("aims a pick under way again at the sheet's new room, and keeps the chart still for a card when nothing is under way", () => {
    const { map, calls, state } = fakeMap();
    const camera = cameraOf(map);
    camera.pick([1, 1], { duration: 800 });
    const pad = { top: 0, bottom: 400, left: 0, right: 0 };
    camera.room(pad, "still", ease);
    expect(calls.map((c) => c.name)).toEqual(["easeTo", "easeTo"]);
    expect(calls[1]!.options).toMatchObject({ center: [1, 1], padding: pad });
    state.moving = false;
    camera.room(pad, "still", ease);
    expect(calls[2]).toMatchObject({ name: "jumpTo", options: { padding: pad } });
  });

  it("lets a pick that will land in sight of the new room land, and takes the room once it has, the chart kept still", async () => {
    const { map, calls, state, fire } = fakeMap();
    const camera = cameraOf(map);
    camera.pick([1, 1], { duration: 800 });
    const pad = { top: 0, bottom: 100, left: 0, right: 0 };
    camera.room(pad, "still", ease);
    expect(calls.map((c) => c.name)).toEqual(["easeTo"]);
    state.moving = false;
    fire("moveend");
    await Promise.resolve();
    expect(calls[1]).toMatchObject({ name: "jumpTo", options: { padding: pad } });
  });

  it("brings a tapped point into sight only when it is out of the room, and a fit of one point likewise (FL-8, FL-20)", () => {
    const { map, calls } = fakeMap();
    const camera = cameraOf(map);
    const pad = { top: 0, bottom: 400, left: 0, right: 0 };
    // Above the card: in sight already.
    expect(camera.pick([0, 1], { onlyIfHidden: true, pad })).toBe(false);
    // Under it: eased into the room, never flown.
    expect(camera.pick([0, -2], { onlyIfHidden: true, pad })).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["easeTo"]);
    camera.fit(
      [
        [0, 0],
        [0, 0],
      ],
      { margin: { top: 30, bottom: 30, left: 30, right: 30 }, duration: 1000 },
    );
    expect(calls.map((c) => c.name)).toEqual(["easeTo"]);
  });
});
