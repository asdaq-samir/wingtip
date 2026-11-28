// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "../../../lib/queryClient";
import { usePrefetchHighlighted } from "./usePrefetchHighlighted";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the one search's lit row", () => {
  it("asks for the airport the pilot stops on, once, not for each row arrowed past", () => {
    vi.useFakeTimers();
    const prefetch = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);
    const { result } = renderHook(() => usePrefetchHighlighted(["KDLH", "KMSP", "KOSH"]));
    const arrow = { reason: "keyboard" };
    result.current("KDLH", arrow);
    vi.advanceTimersByTime(50);
    result.current("KMSP", arrow);
    vi.advanceTimersByTime(50);
    result.current("KOSH", arrow);
    vi.advanceTimersByTime(200);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch.mock.calls[0]?.[0]).toMatchObject({ queryKey: ["airport", "KOSH"] });
  });

  it("waits for the typing to pause before asking for the row it lights", () => {
    vi.useFakeTimers();
    const prefetch = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);
    const { result } = renderHook(() => usePrefetchHighlighted(["KDL", "KDLH"]));
    result.current("KDL", { reason: "none" });
    vi.advanceTimersByTime(200);
    result.current("KDLH", { reason: "none" });
    vi.advanceTimersByTime(200);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch.mock.calls[0]?.[0]).toMatchObject({ queryKey: ["airport", "KDLH"] });
  });

  it("asks nothing for an airplane's or a waypoint's row, or none lit", () => {
    vi.useFakeTimers();
    const prefetch = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);
    const { result } = renderHook(() => usePrefetchHighlighted(["KDLH"]));
    result.current("KDLH");
    result.current("fix:DLH");
    result.current(undefined);
    vi.advanceTimersByTime(500);
    expect(prefetch).not.toHaveBeenCalled();
  });
});
