import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookTokens, type Look } from "./contrast";

/**
 * The Native look (design/tokens.json color.look.native) is the
 * platform's own: every colour it sets is a CSS system colour or a mix of
 * them, never a value of ours, so the browser decides it. What it leaves
 * alone is aviation's and stays the theme's: the states, the course, the
 * airspace's and the procedures' inks.
 */
const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
const SYSTEM =
  /^(Canvas|CanvasText|LinkText|AccentColor|color-mix\(in (srgb|oklab), (Canvas|CanvasText|LinkText)( \d+%)?, (Canvas|CanvasText)\))$/;
const look = (brand: Look["brand"], dark: boolean) => lookTokens(css, { brand, dark, bright: false });

describe("the Native look", () => {
  it.each([false, true])("draws its surfaces, words and tint in the system's colours (night: %s)", (dark) => {
    const t = look("native", dark);
    for (const name of [
      "--background",
      "--foreground",
      "--card",
      "--popover",
      "--sheet",
      "--muted",
      "--muted-foreground",
      "--tint",
      "--primary",
      "--primary-foreground",
      "--ring",
      "--border",
      "--input",
    ]) {
      expect(t[name], name).toMatch(SYSTEM);
    }
  });

  it("puts the ring in AccentColor where the browser has it, LinkText where it has not", () => {
    expect(css).toMatch(/@supports \(color: AccentColor\) \{\s*:root\[data-brand="native"\][^{]*\{\s*--ring: AccentColor;/);
    expect(css).toMatch(/:root\[data-brand="native"\]:not\(\[data-chart-light="bright"\]\) \{[^}]*--ring: LinkText;/);
  });

  it("sets the system's face", () => {
    expect(look("native", false)["--brand-font"]).toBe("system-ui");
  });

  it.each([false, true])("keeps aviation's colours as the Wingtip theme has them (night: %s)", (dark) => {
    const native = look("native", dark);
    const wingtip = look("wingtip", dark);
    for (const name of [
      "--caution",
      "--caution-ink",
      "--go",
      "--go-ink",
      "--destructive",
      "--destructive-ink",
      "--course",
      "--procedure",
      "--airspace-blue-text",
      "--airspace-magenta-text",
    ]) {
      expect(native[name], name).toBe(wingtip[name]);
    }
  });

  it("gives way to sunlight's solid white", () => {
    const t = lookTokens(css, { brand: "native", dark: false, bright: true });
    expect(t["--background"]).toBe("#ffffff");
    expect(t["--tint"]).toBe("#0047a0");
  });
});
