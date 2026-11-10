// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelState } from "../../lib/mapChrome";
import { DRAWER_MS } from "./insets";
import { useSheetLife } from "./useSheetLife";

describe("useSheetLife", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (state: PanelState = "peek") => {
    const tell = vi.fn();
    const hook = renderHook(({ s }) => useSheetLife(s, tell), { initialProps: { s: state } });
    return { tell, hook };
  };

  it("lays the sheet out for a bigger size at once, and tells the page once it has landed", () => {
    const { tell, hook } = setup("peek");
    act(() => hook.result.current.go("half", true));
    expect(hook.result.current.snap).toBe("half");
    expect(hook.result.current.size).toBe("half");
    expect(hook.result.current.moving).toBe(true);
    expect(tell).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(DRAWER_MS + 50));
    expect(hook.result.current.moving).toBe(false);
    expect(tell).toHaveBeenCalledWith("half");
  });

  it("keeps the bigger layout on the way down until the sheet has landed", () => {
    const { hook } = setup("half");
    act(() => hook.result.current.go("peek", true));
    expect(hook.result.current.snap).toBe("peek");
    expect(hook.result.current.size).toBe("half");
    act(() => vi.advanceTimersByTime(DRAWER_MS + 50));
    expect(hook.result.current.size).toBe("peek");
  });

  it("goes to the page's own size without telling it back", () => {
    const { tell, hook } = setup("peek");
    hook.rerender({ s: "full" });
    expect(hook.result.current.snap).toBe("full");
    act(() => vi.advanceTimersByTime(DRAWER_MS + 50));
    expect(hook.result.current.size).toBe("full");
    expect(tell).not.toHaveBeenCalled();
  });
});
