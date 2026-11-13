// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keyHint, shortcutKey } from "./shortcutKeys";
import { onShortcut } from "../hooks/use-shortcuts";
import { useWanted } from "./navigation/wanted";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

describe("the shortcuts' keys (WCAG 2.1.4)", () => {
  it("takes Alt and the physical key, as Option types another character on a Mac", () => {
    expect(shortcutKey(key({ key: "∫", code: "KeyB", altKey: true }))).toBe("B");
    expect(shortcutKey(key({ key: "ƒ", code: "KeyF", altKey: true }))).toBe("F");
    expect(shortcutKey(key({ key: "÷", code: "Slash", altKey: true }))).toBe("/");
  });

  it("never takes a letter alone, nor with Command, Control or Shift", () => {
    expect(shortcutKey(key({ key: "b", code: "KeyB" }))).toBeNull();
    expect(shortcutKey(key({ key: "/", code: "Slash" }))).toBeNull();
    expect(shortcutKey(key({ key: "b", code: "KeyB", altKey: true, metaKey: true }))).toBeNull();
    expect(shortcutKey(key({ key: "b", code: "KeyB", altKey: true, ctrlKey: true }))).toBeNull();
    expect(shortcutKey(key({ key: "B", code: "KeyB", altKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutKey(key({ key: "Enter", code: "Enter", altKey: true }))).toBeNull();
  });

  it("shows the key as Alt+ and the letter", () => {
    expect(keyHint("F")).toBe("Alt+F");
    expect(keyHint(undefined)).toBeUndefined();
  });

  it("leaves a bare letter to the browser and VoiceOver, and opens the Brief on Alt+B", () => {
    useWanted.setState({ screen: null });
    document.addEventListener("keydown", onShortcut);
    const bare = key({ key: "b", code: "KeyB" });
    document.body.dispatchEvent(bare);
    expect(bare.defaultPrevented).toBe(false);
    expect(useWanted.getState().screen).toBeNull();
    const alt = key({ key: "∫", code: "KeyB", altKey: true });
    document.body.dispatchEvent(alt);
    expect(alt.defaultPrevented).toBe(true);
    expect(useWanted.getState().screen).toBe("brief");
    document.removeEventListener("keydown", onShortcut);
    useWanted.setState({ screen: null });
  });
});
