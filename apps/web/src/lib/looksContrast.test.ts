import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wcagContrast as contrast, type Color } from "culori";
import { lookTokens, over, parseColour, type Look } from "./contrast";
import { BADGE, CATEGORY, CATEGORY_CHIP } from "./tokens";

/**
 * Every look the pilot can pick, by day, at night and in sunlight, held to
 * WCAG 2.2's contrast: words 4.5:1 on every surface they sit on (1.4.3),
 * and what marks a control or a state 3:1 (1.4.11). The colours are
 * tokens.css's, which scripts/build/design-tokens.sh writes from
 * design/tokens.json for the phones too (Tokens.swift, Tokens.kt), so a
 * retuned token that drops under the line fails here before any app draws
 * it. contrast.test.ts holds the night theme's own block; this one the
 * cascade of every look over it.
 */
const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

const LOOKS: (Look & { name: string })[] = [];
for (const brand of ["wingtip", "cockpit", "ink", "native"] as const) {
  for (const dark of [false, true]) {
    for (const bright of [false, true]) {
      const name = `${{ wingtip: "Wingtip", cockpit: "Glass Cockpit", ink: "Chart ink", native: "Native" }[brand]}, ${dark ? "night" : "day"}${bright ? ", sunlight" : ""}`;
      LOOKS.push({ name, brand, dark, bright });
    }
  }
}

/**
 * Where the Native look, shadcn's stock neutral theme as it ships, is
 * under WCAG's line, with its ratio: reported, not recoloured (the owner,
 * 2026-11-10: Native is the stock components "out of the box", and a
 * stock default that fails is said so). shadcn's muted words on its muted
 * fill are 4.34:1 by day, under 1.4.3's 4.5:1; its focus ring, the
 * neutral 0.708, is 2.59:1 on white and 2.38:1 on the muted fill by day,
 * under 1.4.11's 3:1. Each pair is held at its figure, so a stock change
 * either way shows here. Every other pair in Native passes. (Not measured
 * here: a field's edge, --input, which no look holds to 3:1 in this test;
 * shadcn's is 1.26:1 on white, the edge a stock Input has.)
 */
const STOCK_SHORTFALLS: Record<string, number> = {
  "Native, day: --muted-foreground on --muted": 4.34,
  "Native, day: --ring on --background": 2.59,
  "Native, day: --ring on --card": 2.59,
  "Native, day: --ring on --popover": 2.59,
  "Native, day: --ring on --muted": 2.38,
  "Native, day: --ring on --sheet": 2.59,
};

/** What a pair is held to: `least` as WCAG gives it, which the ratio
 *  must reach (min(ratio, least) is least), or one of Native's stock
 *  shortfalls, which its ratio, to two places, must be. */
const heldTo = (look: string, a: string, b: string, ratio: number, least: number) => {
  const known = STOCK_SHORTFALLS[`${look}: ${a} on ${b}`];
  return known === undefined ? { got: Math.min(ratio, least), want: least } : { got: Math.round(ratio * 100) / 100, want: known };
};

const colour = (v: string | undefined, what: string): Color => {
  const c = v === undefined ? null : parseColour(v);
  if (!c) throw new Error(`${what} is not a colour: ${v}`);
  return c;
};

/** The surfaces words are set on: the page, cards, menus, a muted row and
 *  the sheet. */
const SURFACES = ["--background", "--card", "--popover", "--muted", "--sheet"];
/** The tokens set as words (text-*): the body, the muted notes, everything
 *  tappable (text-tint; --primary is a fill, its words --primary-foreground,
 *  and at night it is 3.7:1 as words, so nothing sets text-primary), and
 *  each state's words (text-caution, text-destructive and their inks). */
const WORDS = [
  "--foreground",
  "--muted-foreground",
  "--tint",
  "--caution",
  "--caution-ink",
  "--go-ink",
  "--destructive",
  "--destructive-ink",
];
/** Words on their own fills: each pair as a component sets it. */
const ON_FILL: [string, string][] = [
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--primary-foreground", "--primary"],
];
/** What draws a state or a control without words, 3:1 on the surfaces:
 *  the focus ring and each state's colour as a glyph or a dot. A filled
 *  button is known by its words (ON_FILL), not its edge, so --primary is
 *  not held here (WCAG 1.4.11's "visual information required to identify"). */
const NON_TEXT = ["--ring", "--caution", "--go", "--destructive"];

describe.each(LOOKS)("$name", (look) => {
  const t = lookTokens(css, look);
  const c = (name: string) => colour(t[name], `${look.name} ${name}`);

  it.each(WORDS.flatMap((w) => SURFACES.map((s) => [w, s] as const)))("%s reads 4.5:1 or more on %s", (word, surface) => {
    const { got, want } = heldTo(look.name, word, surface, contrast(c(word), c(surface)), 4.5);
    expect(got).toBe(want);
  });

  it.each(ON_FILL)("%s reads 4.5:1 or more on %s", (word, fill) => {
    const { got, want } = heldTo(look.name, word, fill, contrast(c(word), c(fill)), 4.5);
    expect(got).toBe(want);
  });

  it.each(NON_TEXT.flatMap((u) => SURFACES.map((s) => [u, s] as const)))("%s marks 3:1 or more on %s", (mark, surface) => {
    const { got, want } = heldTo(look.name, mark, surface, contrast(c(mark), c(surface)), 3);
    expect(got).toBe(want);
  });

  it("caution's words on its wash, 4.5:1 or more", () => {
    const wash = t["--caution-wash"] ?? "";
    const alpha = Number(/\/\s*([\d.]+)%/.exec(wash)?.[1] ?? 100) / 100;
    for (const surface of ["--card", "--background"]) {
      expect(
        contrast(c("--caution-ink"), over(colour(wash.replace(/\s*\/\s*[\d.]+%\)/, ")"), "wash"), alpha, c(surface))),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the flight categories' colours", () => {
  /** White words on a category's chip (lib/map/marks/flightCategory
   *  chipFillOf), as the nearest list and a place's card set them. */
  it.each(Object.entries(CATEGORY_CHIP))("white words read 4.5:1 or more on %s's chip", (_, fill) => {
    expect(contrast(colour("#ffffff", "white"), colour(fill, "chip"))).toBeGreaterThanOrEqual(4.5);
  });

  /** The map's discs on the white ring they are drawn in
   *  (lib/map/marks/airportMark): 3:1, a graphic that carries meaning. */
  it.each(Object.entries(CATEGORY))("%s's disc marks 3:1 or more on white", (_, disc) => {
    expect(contrast(colour(disc, "disc"), colour("#ffffff", "white"))).toBeGreaterThanOrEqual(3);
  });
});

describe("the status badges' fills", () => {
  /** White words on each StatusBadge's fill (components/StatusBadge), the
   *  same in every look and scheme: 4.5:1, a badge's words being text. */
  const fills = Object.entries(BADGE).filter(([name]) => name.startsWith("status") || name === "air");
  it.each(fills)("white words read 4.5:1 or more on %s", (_, fill) => {
    expect(contrast(colour("#ffffff", "white"), colour(fill, "fill"))).toBeGreaterThanOrEqual(4.5);
  });
});
