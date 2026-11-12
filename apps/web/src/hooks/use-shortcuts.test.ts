// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSearchKey, onShortcut } from "./use-shortcuts";
import { useWanted } from "../lib/navigation/wanted";
import { takeSearchAsk, useSearchAsk } from "../lib/oneSearch";

/** A panel with its one search and a close, all in sight. */
function page() {
  document.body.innerHTML = `
    <section data-slot="map-panel">
      <input type="search" aria-label="Search airports, airplanes, or ask" />
      <button data-back="">Back</button>
    </section>
    <input id="field" />`;
}

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

describe("a desktop's shortcuts", () => {
  beforeEach(() => {
    page();
    // jsdom lays nothing out: everything here is in sight.
    HTMLElement.prototype.checkVisibility = () => true;
    document.addEventListener("keydown", onShortcut);
  });
  afterEach(() => document.removeEventListener("keydown", onShortcut));

  it("Alt+/ goes to the search field, and a bare / does not", () => {
    expect(press("/").defaultPrevented).toBe(false);
    expect(alt("/").defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute("type")).toBe("search");
  });

  it("/ asks the one search for itself where no field is in sight", () => {
    document.querySelector("input")!.remove();
    expect(alt("/").defaultPrevented).toBe(true);
    expect(useSearchAsk.getState().ask?.mode).toBe("all");
    takeSearchAsk();
  });

  it("no longer has number keys for tabs", () => {
    expect(press("1").defaultPrevented).toBe(false);
  });

  it("Escape goes back one level by the top card's close", () => {
    const back = vi.fn();
    document.querySelector("[data-back]")!.addEventListener("click", back);
    press("Escape");
    expect(back).toHaveBeenCalledOnce();
  });

  it("leaves a key typed in a field, and one already used, alone", () => {
    const field = document.getElementById("field")!;
    field.focus();
    expect(alt("/", field).defaultPrevented).toBe(false);
    expect(press("2", field).defaultPrevented).toBe(false);
    const used = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    used.preventDefault();
    const back = vi.fn();
    document.querySelector("[data-back]")!.addEventListener("click", back);
    document.body.dispatchEvent(used);
    expect(back).not.toHaveBeenCalled();
  });

  it("Alt+B opens the Brief, Alt+N Nearest and Alt+D the search for Direct To", () => {
    expect(alt("b").defaultPrevented).toBe(true);
    expect(useWanted.getState().screen).toBe("brief");
    alt("N");
    expect(useWanted.getState().screen).toBe("nearest");
    alt("d");
    expect(useSearchAsk.getState().ask?.mode).toBe("direct");
    takeSearchAsk();
    const field = document.getElementById("field")!;
    field.focus();
    expect(alt("b", field).defaultPrevented).toBe(false);
  });

  it("knows ⌘K and Ctrl K for the search, and not K alone", () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { key: "k", code: "KeyK", ...init });
    expect(isSearchKey(key({ metaKey: true }))).toBe(true);
    expect(isSearchKey(key({ ctrlKey: true }))).toBe(true);
    expect(isSearchKey(key({}))).toBe(false);
    expect(isSearchKey(key({ metaKey: true, shiftKey: true }))).toBe(false);
  });
});
