// @vitest-environment jsdom
/**
 * The route's Undo reaches the bar under the route (RouteUndoBar) through
 * useRouteUndo, not a toast: a change that takes something away puts its
 * words and Undo there, and Undo puts the route back and lets the bar go.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTLE_MS } from "./planHistory";
import { usePlanHistory, useRouteUndo } from "./use-plan-history";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useRouteUndo.setState({ note: null, at: 0, undo: null });
});

describe("the route's Undo bar", () => {
  it("says what a clearing took and gives it back", () => {
    vi.useFakeTimers();
    const route = new URLSearchParams({ dep: "C81", dest: "KDLH", stops: "KMSN" });
    const set = vi.fn();
    const { rerender } = renderHook(({ params }) => usePlanHistory(params, set), { initialProps: { params: route } });
    expect(useRouteUndo.getState().note).toBeNull();

    // Past the page's own settling after a load, the pilot clears it.
    vi.advanceTimersByTime(SETTLE_MS + 100);
    rerender({ params: new URLSearchParams() });
    const { note, undo } = useRouteUndo.getState();
    expect(note).toBe("Route Cleared");

    act(() => undo!());
    expect(set).toHaveBeenCalledTimes(1);
    const restore = set.mock.calls[0]![0] as (prev: URLSearchParams) => URLSearchParams;
    expect(Object.fromEntries(restore(new URLSearchParams()))).toEqual({ dep: "C81", dest: "KDLH", stops: "KMSN" });
    expect(useRouteUndo.getState().note).toBeNull();
  });

  it("goes with the page", () => {
    const { unmount } = renderHook(() => usePlanHistory(new URLSearchParams(), vi.fn()));
    useRouteUndo.setState({ note: "Route Cleared", at: 1, undo: () => {} });
    unmount();
    expect(useRouteUndo.getState().note).toBeNull();
  });
});
