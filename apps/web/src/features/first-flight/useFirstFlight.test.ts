// @vitest-environment jsdom
/**
 * The first flight's wait for a position, once the destination is picked:
 * said as the page's progress line past 400 ms (the owner's Q2,
 * 2026-11-21), and taken down once the fix (or no fix) is in.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FINDING_YOU, useFirstFlight } from "./useFirstFlight";
import { useSearchPick } from "../../lib/oneSearch";
import { useTips } from "../../lib/firstRunTips";

const fix = vi.hoisted(() => ({ settle: (_: null) => undefined as void }));
vi.mock("../../lib/map/position/ownShip", () => ({
  positionNow: () => new Promise((resolve) => (fix.settle = resolve)),
}));
const toasts = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
vi.mock("../../lib/toast", () => ({ toast: toasts }));

afterEach(() => {
  vi.useRealTimers();
  toasts.add.mockReset();
  toasts.close.mockReset();
});

describe("useFirstFlight's wait for a position", () => {
  test("says it is finding where you are past 400 ms, and stops once answered", async () => {
    vi.useFakeTimers();
    act(() => useTips.setState({ seen: [] }));
    const onPlan = vi.fn();
    const { result } = renderHook(() => useFirstFlight({ routed: false, onPlan, pickView: vi.fn(), setPanel: vi.fn() }));
    act(() => result.current.go());
    act(() => useSearchPick.getState().pick?.onPick("KDLH"));
    act(() => vi.advanceTimersByTime(300));
    expect(toasts.add).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(toasts.add).toHaveBeenCalledWith(expect.objectContaining({ title: FINDING_YOU, type: "loading" }));
    await act(async () => fix.settle(null));
    expect(toasts.close).toHaveBeenCalled();
  });
});
