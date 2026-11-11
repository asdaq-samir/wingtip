// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PanelState } from "../../lib/mapChrome";
import { useSheetLife } from "./useSheetLife";

describe("useSheetLife", () => {
  const setup = (state: PanelState = "peek", still?: () => boolean) => {
    const tell = vi.fn();
    const hook = renderHook(({ s }) => useSheetLife(s, tell, still), { initialProps: { s: state } });
    return { tell, hook };
  };

  it("lays the sheet out for a bigger size at once, and tells the page once the Drawer has landed", () => {
    const { tell, hook } = setup("peek");
    act(() => hook.result.current.go("half", true));
    expect(hook.result.current.snap).toBe("half");
    expect(hook.result.current.size).toBe("half");
    expect(hook.result.current.moving).toBe(true);
    expect(tell).not.toHaveBeenCalled();
    act(() => hook.result.current.landed());
    expect(hook.result.current.moving).toBe(false);
    expect(tell).toHaveBeenCalledWith("half");
  });

  it("keeps the bigger layout on the way down until the sheet has landed", () => {
    const { hook } = setup("half");
    act(() => hook.result.current.go("peek", true));
    expect(hook.result.current.snap).toBe("peek");
    expect(hook.result.current.size).toBe("half");
    act(() => hook.result.current.landed());
    expect(hook.result.current.size).toBe("peek");
  });

  it("goes to the page's own size without telling it back", () => {
    const { tell, hook } = setup("peek");
    hook.rerender({ s: "full" });
    expect(hook.result.current.snap).toBe("full");
    act(() => hook.result.current.landed());
    expect(hook.result.current.size).toBe("full");
    expect(tell).not.toHaveBeenCalled();
  });

  it("lands at once where nothing slides (the side panel, Reduce Motion)", () => {
    const { tell, hook } = setup("peek", () => true);
    act(() => hook.result.current.go("full", true));
    expect(hook.result.current.size).toBe("full");
    expect(hook.result.current.moving).toBe(false);
    expect(tell).toHaveBeenCalledWith("full");
  });
});
