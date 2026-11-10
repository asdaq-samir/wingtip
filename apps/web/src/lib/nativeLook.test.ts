import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookTokens, type Look } from "./contrast";
import { TYPE_CLASS } from "./tokens";

/**
 * The Native look is the web's components as they come out of the box
 * (the owner, 2026-11-10: "Native means how they come out of the box,
 * look and behavior wise"): shadcn's stock theme for the base-vega style
 * on the neutral base colour (components.json), its CSS variables as
 * `shadcn init` writes them, held here against shadcn's own table
 * (ui.shadcn.com/docs/theming) so a retuned token fails. What it leaves
 * alone is aviation's and stays the theme's: the states, the course, the
 * airspace's and the procedures' inks.
 */
const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const look = (brand: Look["brand"], dark: boolean) => lookTokens(css, { brand, dark, bright: false });

const SHADCN_NEUTRAL = {
  day: {
    "--background": "oklch(1 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.205 0 0)",
    "--primary-foreground": "oklch(0.985 0 0)",
    "--secondary": "oklch(0.97 0 0)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--accent": "oklch(0.97 0 0)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
    "--ring": "oklch(0.708 0 0)",
  },
  night: {
    "--background": "oklch(0.145 0 0)",
    "--foreground": "oklch(0.985 0 0)",
    "--card": "oklch(0.205 0 0)",
    "--card-foreground": "oklch(0.985 0 0)",
    "--popover": "oklch(0.205 0 0)",
    "--popover-foreground": "oklch(0.985 0 0)",
    "--primary": "oklch(0.922 0 0)",
    "--primary-foreground": "oklch(0.205 0 0)",
    "--secondary": "oklch(0.269 0 0)",
    "--secondary-foreground": "oklch(0.985 0 0)",
    "--muted": "oklch(0.269 0 0)",
    "--muted-foreground": "oklch(0.708 0 0)",
    "--accent": "oklch(0.269 0 0)",
    "--accent-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.556 0 0)",
  },
};

describe("the Native look", () => {
  it.each([false, true])("is shadcn's stock neutral theme, as written (night: %s)", (dark) => {
    const t = look("native", dark);
    for (const [name, value] of Object.entries(SHADCN_NEUTRAL[dark ? "night" : "day"])) expect(t[name], name).toBe(value);
    // Wingtip's own names, each the stock role a stock component draws it in.
    expect(t["--tint"]).toBe(t["--primary"]);
    expect(t["--sheet"]).toBe(t["--background"]);
  });

  it("keeps shadcn's own radius and face: no look's typeface over Inter", () => {
    const t = look("native", false);
    expect(t["--radius"]).toBe("0.625rem");
    expect(t["--brand-font"]).toBeUndefined();
    expect(t["--display"]).toBe(look("wingtip", false)["--display"]);
  });

  it("has no frost, no give and no lift, and Tailwind's own shadows", () => {
    const t = look("native", false);
    expect(t["--glass-blur"]).toBe("0px");
    expect(t["--glass-fill-light"]).toBe("100%");
    expect(t["--sheet-blur"]).toBe("0px");
    expect(t["--feel-press-scale"]).toBe("1");
    expect(t["--feel-lift"]).toBe("0px");
    // Tailwind's shadow-md, a stock popover's.
    expect(t["--depth-overlay"]).toBe("0 4px 6px -1px rgb(0 0 0 / 0.102), 0 2px 4px -2px rgb(0 0 0 / 0.102)");
  });

  it("sets each fixed text role at a Tailwind step, not iOS's", () => {
    const t = look("native", false);
    expect([t["--type-hero"], t["--lead-hero"]]).toEqual(["1.5rem", "2rem"]);
    expect([t["--type-note"], t["--lead-note"]]).toEqual(["0.75rem", "1rem"]);
    expect([t["--type-caption"], t["--lead-caption"]]).toEqual(["0.75rem", "1rem"]);
    // Wingtip keeps its own.
    expect(look("wingtip", false)["--type-hero"]).toBe("1.75rem");
    expect(TYPE_CLASS.hero).toBe("text-(length:--type-hero) leading-(--lead-hero)");
  });

  it("turns Wingtip's touch sizes and states off, keeping the 44-point hit areas", () => {
    expect(index).toMatch(
      /@custom-variant pointer-coarse \{\s*@media \(pointer: coarse\) \{\s*&:where\(:root:not\(\[data-brand="native"\]\) \*\)/,
    );
    expect(index).toMatch(/@custom-variant branded \(&:where\(:root:not\(\[data-brand="native"\]\) \*\)\);/);
    // The hit areas: a pseudo-element on a coarse pointer, whatever the look.
    expect(index).toMatch(/@media \(pointer: coarse\) \{\s*button:not\(\[data-slot="tabs-trigger"\]\)::after/);
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
