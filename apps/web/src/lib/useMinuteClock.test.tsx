// @vitest-environment jsdom
/**
 * The minute clock is one clock for every age on screen: two readers say
 * the same time, and both turn on the minute together.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMinuteClock } from "./useMinuteClock";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T12:00:30Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the minute clock", () => {
  test("gives its readers one time, turned on the minute", () => {
    const a = renderHook(() => useMinuteClock());
    const b = renderHook(() => useMinuteClock());
    expect(b.result.current).toBe(a.result.current);
    act(() => vi.advanceTimersByTime(30_000));
    expect(a.result.current).toBe(Date.parse("2026-11-27T12:01:00Z"));
    expect(b.result.current).toBe(a.result.current);
  });
});
