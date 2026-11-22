// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyHint } from "./shortcutKeys";
import { useShortcuts } from "../hooks/use-shortcuts";
import { useWanted } from "./navigation/wanted";

/** Alt+B pressed as a keyboard sends it, on the page with its shortcuts. */
const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
};
const opened = () => useWanted.getState().screen;

describe("the shortcuts' keys (WCAG 2.1.4)", () => {
  let unmount: () => void;
  beforeEach(() => {
    useWanted.setState({ screen: null });
    unmount = renderHook(() => useShortcuts(true)).unmount;
  });
  afterEach(() => {
    unmount();
    useWanted.setState({ screen: null });
  });

  it("takes Alt and the physical key, as Option types another character on a Mac", () => {
    expect(press({ key: "∫", code: "KeyB", altKey: true }).defaultPrevented).toBe(true);
    expect(opened()).toBe("brief");
  });

  it("never takes a letter alone, nor with Command, Control or Shift", () => {
    for (const init of [
      { key: "b", code: "KeyB" },
      { key: "b", code: "KeyB", altKey: true, metaKey: true },
      { key: "b", code: "KeyB", altKey: true, ctrlKey: true },
      { key: "B", code: "KeyB", altKey: true, shiftKey: true },
    ])
      expect(press(init).defaultPrevented).toBe(false);
    expect(opened()).toBeNull();
  });

  it("shows the key as Alt+ and the letter", () => {
    expect(keyHint("F")).toBe("Alt+F");
    expect(keyHint(undefined)).toBeUndefined();
  });
});
