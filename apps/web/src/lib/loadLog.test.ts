import { beforeEach, describe, expect, it } from "vitest";
import { loadLogLooking, startLoadLog, useLoadLog } from "./loadLog";

/** A page as the log reads it: its marks, its answers, the map's element
 *  and a probe, with the log's look run by hand. */
function page() {
  const marks = new Set<string>();
  const resources: Partial<PerformanceResourceTiming>[] = [];
  let now = 0;
  let tick = () => {};
  const probe = { dataset: { glProbe: "airspace-lines" }, getAttribute: () => "[]" };
  const win = {
    performance: {
      now: () => now,
      getEntriesByType: (type: string) => (type === "resource" ? resources : []),
      getEntriesByName: (name: string) => (marks.has(name) ? [{ startTime: now }] : []),
    },
    document: { querySelector: () => ({}), querySelectorAll: () => [probe] },
    setInterval: (fn: () => void) => ((tick = fn), 1),
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Window;
  return {
    win,
    look: (at: number) => ((now = at), tick()),
    mark: (name: string) => marks.add(name),
    answer: (name: string) => resources.push({ name, responseEnd: now }),
    draw: () => (probe.getAttribute = () => '[{"id":"tile-1"}]'),
  };
}

describe("the load log", () => {
  beforeEach(() => useLoadLog.setState({ value: [] }));

  it("stops its probes once the map is ready and keeps the load when the TFRs are in", () => {
    const p = page();
    startLoadLog(p.win);
    p.mark("chart-drawn");
    p.draw();
    p.look(800);
    expect(loadLogLooking("airspace-lines")).toBe(true);
    p.mark("map-ready");
    p.look(1000);
    // Ready: the probes stop, the layers not drawn by then left out.
    expect(loadLogLooking("airspace-lines")).toBe(false);
    expect(useLoadLog.getState().value).toHaveLength(0);
    p.answer("/api/planner/tfrs");
    p.look(1200);
    const [load] = useLoadLog.getState().value;
    expect(load?.ms).toMatchObject({ map: 800, tile: 800, rings: 800, tfrData: 1000 });
    expect(load?.ms).not.toHaveProperty("airports");
  });

  it("gives up at 30 s on a map that never comes to rest", () => {
    const p = page();
    startLoadLog(p.win);
    p.look(29_000);
    expect(useLoadLog.getState().value).toHaveLength(0);
    p.look(30_001);
    expect(useLoadLog.getState().value).toHaveLength(1);
    expect(loadLogLooking("airspace-lines")).toBe(false);
  });
});
