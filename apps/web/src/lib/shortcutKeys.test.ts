// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { keyHint, shortcutKey, useShortcutKeys } from "./shortcutKeys";
import { onShortcut } from "../hooks/use-shortcuts";
import { useWanted } from "./navigation/wanted";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

describe("the shortcuts' keys (WCAG 2.1.4)", () => {
  afterEach(() => useShortcutKeys.setState({ mode: "letters" }));

  it("takes the letter alone by default, never with Command, Control or Alt", () => {
    expect(shortcutKey(key({ key: "b", code: "KeyB" }), "letters")).toBe("B");
    expect(shortcutKey(key({ key: "/", code: "Slash" }), "letters")).toBe("/");
    expect(shortcutKey(key({ key: "b", code: "KeyB", metaKey: true }), "letters")).toBeNull();
    expect(shortcutKey(key({ key: "∫", code: "KeyB", altKey: true }), "letters")).toBeNull();
    expect(shortcutKey(key({ key: "Enter", code: "Enter" }), "letters")).toBeNull();
  });

  it("takes Alt and the physical key once remapped, as Option types another character on a Mac", () => {
    expect(shortcutKey(key({ key: "∫", code: "KeyB", altKey: true }), "alt")).toBe("B");
    expect(shortcutKey(key({ key: "÷", code: "Slash", altKey: true }), "alt")).toBe("/");
    expect(shortcutKey(key({ key: "b", code: "KeyB" }), "alt")).toBeNull();
  });

  it("takes nothing when off", () => {
    expect(shortcutKey(key({ key: "b", code: "KeyB" }), "off")).toBeNull();
    expect(shortcutKey(key({ key: "b", code: "KeyB", altKey: true }), "off")).toBeNull();
  });

  it("shows the key as it is pressed, and none when off", () => {
    expect(keyHint("B", "letters")).toBe("B");
    expect(keyHint("B", "alt")).toMatch(/^(⌥B|Alt\+B)$/);
    expect(keyHint("B", "off")).toBeUndefined();
    expect(keyHint(undefined, "letters")).toBeUndefined();
  });

  it("leaves a stray letter alone once the pilot turns the shortcuts off", () => {
    useWanted.setState({ screen: null });
    document.addEventListener("keydown", onShortcut);
    useShortcutKeys.setState({ mode: "off" });
    const event = key({ key: "b", code: "KeyB" });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(useWanted.getState().screen).toBeNull();
    useShortcutKeys.setState({ mode: "alt" });
    const alt = key({ key: "∫", code: "KeyB", altKey: true });
    document.body.dispatchEvent(alt);
    expect(alt.defaultPrevented).toBe(true);
    expect(useWanted.getState().screen).toBe("brief");
    document.removeEventListener("keydown", onShortcut);
    useWanted.setState({ screen: null });
  });
});
