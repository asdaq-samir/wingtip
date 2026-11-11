// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onShortcut } from "../../../hooks/use-shortcuts";
import { takeSearchAsk, useSearchAsk } from "../../../lib/oneSearch";
import { useCardKeys } from "./useCardKeys";

const press = (key: string, target: Element = document.body) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("the airport card's letters on a desktop", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    takeSearchAsk();
  });

  it("F, D and S run Fly Here, Depart From and Add as Stop, ahead of the page's own D", () => {
    const fly = vi.fn(),
      depart = vi.fn(),
      stop = vi.fn();
    document.addEventListener("keydown", onShortcut);
    const { unmount } = renderHook(() => useCardKeys(true, { F: fly, D: depart, S: stop }));
    expect(press("f").defaultPrevented).toBe(true);
    press("D");
    press("s");
    expect([fly, depart, stop].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    // Not the page's Direct To, which D is with no card open.
    expect(useSearchAsk.getState().ask).toBeNull();
    unmount();
    document.removeEventListener("keydown", onShortcut);
  });

  it("leaves a letter typed in a field alone, and does nothing while off", () => {
    const fly = vi.fn();
    document.body.innerHTML = "<input id='field' />";
    const field = document.getElementById("field")!;
    const { rerender, unmount } = renderHook(({ on }) => useCardKeys(on, { F: fly }), { initialProps: { on: true } });
    expect(press("f", field).defaultPrevented).toBe(false);
    rerender({ on: false });
    press("f");
    expect(fly).not.toHaveBeenCalled();
    unmount();
  });
});
