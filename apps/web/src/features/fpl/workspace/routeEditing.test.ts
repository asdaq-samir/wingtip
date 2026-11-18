/** The suggested routes' ways on FPL's map, out only with their toggle
 *  (waysOnMap; the owner's screenshot, 2026-11-18, of a route that read
 *  as two). */
import { describe, expect, test } from "vitest";
import type { RouteWay } from "../../../lib/map/route/routeWays";
import type { PlanSlices } from "../vm/planSlices";
import { routesOut, waysOnMap } from "./routeEditing";

const typed: RouteWay = {
  key: "own",
  label: "",
  name: "As typed",
  path: [
    [41.79, -87.75],
    [41.07, -87.85],
    [38.75, -90.37],
  ],
};
const weather: RouteWay = {
  key: "weather",
  label: "1h 40m",
  name: "Avoid Weather",
  path: [
    [41.79, -87.75],
    [38.75, -90.37],
  ],
};

/** FPL's view model as the map reads it: a whole route folded, on the ground. */
function vm({
  shown = false,
  folded = true,
  flying = false,
  dryRunning = false,
  offered = true,
}: { shown?: boolean; folded?: boolean; flying?: boolean; dryRunning?: boolean; offered?: boolean } = {}) {
  return {
    flight: { flying, dryRunning },
    routeList: {
      routesShown: shown,
      routeFolded: folded,
      routeLine: offered ? { chips: [], picked: "none", onPick: () => {}, stale: false } : null,
      wayLines: [typed, weather],
    },
  } as unknown as PlanSlices<"flight" | "routeList">;
}

describe("waysOnMap", () => {
  test("none with the toggle off: not the route as typed, not a way picked", () => {
    expect(waysOnMap(vm())).toEqual([]);
  });

  test("the same empty list each time, so the map is not drawn again", () => {
    expect(waysOnMap(vm())).toBe(waysOnMap(vm({ flying: true })));
  });

  test("every way with the toggle on", () => {
    expect(waysOnMap(vm({ shown: true }))).toEqual([typed, weather]);
  });

  test("none while the route's field is open, in flight or in a dry run, the toggle on or not", () => {
    for (const state of [{ folded: false }, { flying: true }, { dryRunning: true }]) {
      expect(routesOut(vm({ shown: true, ...state }))).toBe(false);
      expect(waysOnMap(vm({ shown: true, ...state }))).toEqual([]);
    }
  });

  test("none where there are no ways to suggest", () => {
    expect(waysOnMap(vm({ shown: true, offered: false }))).toEqual([]);
  });
});
