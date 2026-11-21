/**
 * The map's errors: a tile the chart has none of, a request cut off and
 * one with no network stay quiet; anything else is said on the problem
 * line, reported, and gone at the next clean rest.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSystemProblems } from "../../lib/problems";
import { sendReport } from "../../lib/errorReports";
import { MAP_PROBLEM, quietMapError, watchMapErrors } from "./mapErrors";

vi.mock("../../lib/errorReports", () => ({ reportOf: (kind: string, error: unknown) => ({ kind, error }), sendReport: vi.fn(() => true) }));

afterEach(() => {
  useSystemProblems.setState({ problems: [] });
  vi.mocked(sendReport).mockClear();
  vi.unstubAllGlobals();
});

const said = () => useSystemProblems.getState().problems.some((p) => p.id === MAP_PROBLEM);

function fakeMap() {
  const on: Record<string, (e: { error?: unknown; sourceId?: string }) => void> = {};
  return {
    on: (type: string, f: (e: { error?: unknown; sourceId?: string }) => void) => void (on[type] = f),
    fire: (type: string, error?: unknown, sourceId?: string) => on[type]!({ error, sourceId }),
    refreshTiles: vi.fn(),
  };
}

describe("quietMapError", () => {
  it("is quiet for a tile 404, an abort and a dropped connection", () => {
    expect(quietMapError(Object.assign(new Error("Not Found"), { status: 404 }), true)).toBe(true);
    expect(quietMapError(new DOMException("aborted", "AbortError"), true)).toBe(true);
    expect(quietMapError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(quietMapError(new Error("anything"), false)).toBe(true);
  });

  it("speaks for a server's failure or a broken archive", () => {
    expect(quietMapError(Object.assign(new Error("Internal"), { status: 500 }), true)).toBe(false);
    expect(quietMapError(new Error("Wrong magic number for PMTiles archive"), true)).toBe(false);
  });
});

describe("watchMapErrors", () => {
  it("says and reports a real failure, and clears it at the next clean rest", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const send = vi.mocked(sendReport);
    const map = fakeMap();
    // A stand-in with MapLibre's `on` for the two events it hears.
    watchMapErrors(map as unknown as Parameters<typeof watchMapErrors>[0]);

    map.fire("error", Object.assign(new Error("Not Found"), { status: 404 }));
    expect(said()).toBe(false);
    expect(send).not.toHaveBeenCalled();

    map.fire("error", new Error("Glyph range failed"));
    expect(said()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);

    map.fire("idle");
    expect(said()).toBe(true);
    map.fire("idle");
    expect(said()).toBe(false);
  });

  it("asks a source's failed tiles again from Try again, and the next clean rest takes the line away", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const map = fakeMap();
    watchMapErrors(map as unknown as Parameters<typeof watchMapErrors>[0]);
    // The terrain's tiles failing after the map's last rest: the planner down.
    map.fire("idle");
    map.fire("error", Object.assign(new Error("Bad Gateway"), { status: 502 }), "terrain-dem");
    const problem = useSystemProblems.getState().problems.find((p) => p.id === MAP_PROBLEM)!;
    expect(problem.retry).toBeTypeOf("function");
    // Back, and Try again: the source's tiles asked for again, drawn, at rest.
    problem.retry!();
    expect(map.refreshTiles).toHaveBeenCalledWith("terrain-dem");
    map.fire("idle");
    expect(said()).toBe(false);
  });

  it("offers no Try again for a failure that is not a source's", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const map = fakeMap();
    watchMapErrors(map as unknown as Parameters<typeof watchMapErrors>[0]);
    map.fire("error", new Error("Glyph range failed"));
    expect(useSystemProblems.getState().problems.find((p) => p.id === MAP_PROBLEM)?.retry).toBeUndefined();
  });
});
