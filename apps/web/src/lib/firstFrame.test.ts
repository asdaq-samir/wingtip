// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY } from "./prefs/migrate";
import { usePreferences } from "./preferences";

/** public/first-frame.js, index.html's blocking head script: the night
 *  class, the look and the sunlight scheme on <html> before the body
 *  paints, so a load at night never opens white (AIM 8-1-6). */
const SCRIPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/first-frame.js"), "utf8");
const PREFS_KEY = usePreferences.persist.getOptions().name ?? "";

function load(deviceDark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: deviceDark && query.includes("dark") }));
  // The script as the page runs it: a plain script, no module scope.
  new Function(SCRIPT)();
  return document.documentElement;
}

describe("first-frame.js", () => {
  afterEach(() => {
    localStorage.clear();
    const root = document.documentElement;
    root.className = "";
    root.removeAttribute("style");
    delete root.dataset.brand;
    delete root.dataset.chartLight;
    vi.unstubAllGlobals();
  });

  it("reads the app's own storage keys", () => {
    expect(SCRIPT).toContain(JSON.stringify(THEME_KEY));
    expect(SCRIPT).toContain(JSON.stringify(PREFS_KEY));
  });

  it("puts dark on at once where Setup's theme is Dark, whatever the device", () => {
    localStorage.setItem(THEME_KEY, "dark");
    const root = load(false);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("follows the device's scheme with the theme on System or none kept", () => {
    expect(load(true).classList.contains("dark")).toBe(true);
    localStorage.setItem(THEME_KEY, "system");
    expect(load(false).classList.contains("dark")).toBe(false);
  });

  it("keeps light where Setup's theme is Light on a dark device", () => {
    localStorage.setItem(THEME_KEY, "light");
    expect(load(true).classList.contains("dark")).toBe(false);
  });

  it("puts the kept look and sunlight on, and the defaults without them", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ state: { brand: "ink", chartLight: "on" }, version: 12 }));
    const root = load(true);
    expect(root.dataset.brand).toBe("ink");
    expect(root.dataset.chartLight).toBe("bright");
    localStorage.setItem(PREFS_KEY, "not json");
    load(true);
    expect(root.dataset.brand).toBe("wingtip");
    expect(root.dataset.chartLight).toBe("normal");
  });
});
