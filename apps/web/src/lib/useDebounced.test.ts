// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebounced } from "./useDebounced";

describe("useDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the value once it has stood still for the delay, not at each change", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 400), { initialProps: { value: "C" } });
    expect(result.current).toBe("C");
    rerender({ value: "CL" });
    act(() => vi.advanceTimersByTime(300));
    rerender({ value: "CLE" });
    act(() => vi.advanceTimersByTime(300));
    // 600 ms since the first change, but only 300 since the last.
    expect(result.current).toBe("C");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("CLE");
  });
});
