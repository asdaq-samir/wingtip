import { blend, clampRgb, parse, type Color } from "culori";

/**
 * The theme's colours read for WCAG 2's contrast ratio, as the iOS
 * audit's P15 measures it on the page: a test reads index.css's tokens
 * through this and holds every pair of words and surface to 4.5:1 (WCAG
 * 1.4.3) with culori's `wcagContrast`, so a retuned token that drops
 * below it fails a test, not a pilot at night. The colour itself is
 * culori's (CSS Color 4's parsing and conversions); what is here is how
 * the page draws a token, and which tokens a look ends with.
 */

/** A token's value (`#rrggbb`, `oklch(L C h)`, alpha ignored) as the
 *  browser draws it: clipped to the sRGB gamut, as an out-of-gamut colour
 *  is. Null where it is no colour. */
export function parseColour(value: string): Color | null {
  const colour = parse(value.trim());
  return colour ? clampRgb({ ...colour, alpha: undefined }) : null;
}

/** `fg` at `alpha` over `bg`, blended in encoded sRGB as a browser does. */
export function over(fg: Color, alpha: number, bg: Color): Color {
  return blend([bg, { ...fg, alpha }], "normal", "rgb");
}

/** One of the pilot's looks as <html> carries it: the look (data-brand),
 *  night (.dark) and sunlight (data-chart-light="bright"). */
export interface Look {
  brand: "wingtip" | "cockpit" | "ink" | "native";
  dark: boolean;
  bright: boolean;
}

/** Whether one simple selector of tokens.css (`:root`, `.dark`,
 *  `[data-brand="ink"]`, `:not(...)`) holds for a look. */
function holds(part: string, look: Look): boolean {
  if (part === ":root") return true;
  if (part === ".dark") return look.dark;
  const not = /^:not\((.+)\)$/.exec(part);
  if (not) return !holds(not[1]!, look);
  const attr = /^\[data-([\w-]+)="([^"]+)"\]$/.exec(part);
  if (attr?.[1] === "brand") return look.brand === attr[2];
  if (attr?.[1] === "chart-light") return look.bright === (attr[2] === "bright");
  throw new Error(`tokens.css selector part not understood: ${part}`);
}

/**
 * Every custom property a look ends with, tokens.css's blocks applied as
 * the browser's cascade applies them: each matching selector by its
 * specificity (each simple part counts one, :not() by what it holds),
 * then by source order, and var() references resolved. So a test reads a
 * look's colours as the page draws them, not one block's alone.
 */
export function lookTokens(css: string, look: Look): Record<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const winners: Record<string, { value: string; weight: number; order: number }> = {};
  let order = 0;
  for (const block of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let weight = -1;
    for (const selector of selectors) {
      const parts = selector.match(/:not\([^)]*\)|:root|\.dark|\[[^\]]+\]/g) ?? [];
      if (parts.join("") !== selector.replace(/\s+/g, "")) throw new Error(`tokens.css selector not understood: ${selector}`);
      if (parts.every((p) => holds(p, look))) weight = Math.max(weight, parts.length);
    }
    if (weight < 0) continue;
    for (const m of block[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      order += 1;
      const was = winners[m[1]!];
      if (!was || weight >= was.weight) winners[m[1]!] = { value: m[2]!.trim(), weight, order };
    }
  }
  const out: Record<string, string> = {};
  const resolve = (value: string, depth = 0): string =>
    depth > 8 ? value : value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(winners[name]?.value ?? "", depth + 1));
  for (const [name, { value }] of Object.entries(winners)) out[name] = resolve(value);
  return out;
}

/** The custom properties a block of index.css sets, `--name` to value:
 *  the block whose selector is `selector` (":root", ".dark"). */
export function tokensOf(css: string, selector: string): Record<string, string> {
  const at = css.search(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
  if (at < 0) return {};
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("\n}", at));
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
