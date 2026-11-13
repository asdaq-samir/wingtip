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
/** A shortcut as it is pressed: with Alt held, read by its physical key
 *  (lib/shortcutKeys), as Option-F on a Mac types ƒ. */
const alt = (key: string, target: Element = document.body) => {
  const code = key === "/" ? "Slash" : `Key${key.toUpperCase()}`;
  const event = new KeyboardEvent("keydown", { key, code, altKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("the airport card's letters on a desktop", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    takeSearchAsk();
  });

  it("Alt+F and Alt+S run Fly Here and Add Stop, and Alt+D stays the page's Direct To", () => {
    const fly = vi.fn(),
      stop = vi.fn();
    document.addEventListener("keydown", onShortcut);
    const { unmount } = renderHook(() => useCardKeys(true, { F: fly, S: stop }));
    expect(press("f").defaultPrevented).toBe(false);
    expect(alt("f").defaultPrevented).toBe(true);
    alt("s");
    expect([fly, stop].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    // The card has no D since Depart From left it (the owner, 2026-11-11):
    // the page's Direct To hears it.
    alt("d");
    expect(useSearchAsk.getState().ask).not.toBeNull();
    unmount();
    document.removeEventListener("keydown", onShortcut);
  });

  it("leaves a letter typed in a field alone, and does nothing while off", () => {
    const fly = vi.fn();
    document.body.innerHTML = "<input id='field' />";
    const field = document.getElementById("field")!;
    const { rerender, unmount } = renderHook(({ on }) => useCardKeys(on, { F: fly }), { initialProps: { on: true } });
    expect(alt("f", field).defaultPrevented).toBe(false);
    rerender({ on: false });
    alt("f");
    expect(fly).not.toHaveBeenCalled();
    unmount();
  });
});
