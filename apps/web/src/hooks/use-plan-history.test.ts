// @vitest-environment jsdom
/**
 * The route's Undo is a toast with its Undo (lib/toast's `undo`): a change
 * that takes something away puts its words and Undo there, and Undo puts
 * the route back and takes the toast down.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAddress } from "../lib/address";
import { SETTLE_MS } from "./planHistory";
import { usePlanHistory } from "./use-plan-history";

const shown = vi.hoisted(() => ({ toasts: new Map<string, { words: string; undo: () => void }>(), next: 1 }));
vi.mock("../lib/toast", () => ({
  toast: {
    undo: (words: string, undo: () => void) => {
      const id = `t${shown.next++}`;
      shown.toasts.set(id, { words, undo });
      return id;
    },
    close: (id: string) => shown.toasts.delete(id),
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  shown.toasts.clear();
});

describe("the route's Undo", () => {
  it("says what a clearing took and gives it back", () => {
    vi.useFakeTimers();
    const route = loadAddress("dep=C81&dest=KDLH&stops=KMSN");
    const set = vi.fn();
    const { rerender } = renderHook(({ address }) => usePlanHistory(address, set), { initialProps: { address: route } });
    expect(shown.toasts.size).toBe(0);

    // Past the page's own settling after a load, the pilot clears it.
    vi.advanceTimersByTime(SETTLE_MS + 100);
    rerender({ address: loadAddress("") });
    const [toast] = [...shown.toasts.values()];
    expect(toast?.words).toBe("Route Cleared");

    act(() => toast!.undo());
    expect(set).toHaveBeenCalledTimes(1);
    // The plan's keys put back, the rest of the plan's taken out.
    expect(set.mock.calls[0]![0]).toMatchObject({ dep: "C81", dest: "KDLH", stops: "KMSN", direct: null, procs: null });
    expect(shown.toasts.size).toBe(0);
  });

  it("goes with the page", () => {
    vi.useFakeTimers();
    const route = loadAddress("dep=C81&dest=KDLH");
    const { rerender, unmount } = renderHook(({ address }) => usePlanHistory(address, vi.fn()), { initialProps: { address: route } });
    vi.advanceTimersByTime(SETTLE_MS + 100);
    rerender({ address: loadAddress("") });
    expect(shown.toasts.size).toBe(1);
    unmount();
    expect(shown.toasts.size).toBe(0);
  });
});
