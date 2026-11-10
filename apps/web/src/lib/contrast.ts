/**
 * WCAG 2's contrast ratio between two of the theme's colours, as the
 * iOS audit's P15 measures it on the page: a test reads index.css's
 * tokens through this and holds every pair of words and surface to 4.5:1
 * (WCAG 1.4.3), so a retuned token that drops below it fails a test, not
 * a pilot at night.
 *
 * Reads the two forms the tokens are written in, `#rrggbb` and
 * `oklch(L C h)` (alpha ignored), and a few named mixes are composited
 * by the caller with `over`.
 */

/** A colour as linear-light sRGB, each channel 0 to 1. */
export type Linear = [number, number, number];

const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

/** Björn Ottosson's OKLab to linear sRGB, the matrices CSS Color 4 uses,
 *  clipped to the sRGB gamut as a browser draws an out-of-gamut colour. */
function fromOklch(l: number, c: number, h: number): Linear {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** A token's value as linear sRGB, or null where it is neither form. */
export function parseColour(value: string): Linear | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [decode(((n >> 16) & 255) / 255), decode(((n >> 8) & 255) / 255), decode((n & 255) / 255)];
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(v);
  if (ok) return fromOklch(Number(ok[1]), Number(ok[2]), Number(ok[3]));
  return null;
}

/** WCAG 2's relative luminance. */
const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG 2's contrast ratio, 1 to 21, the lighter over the darker. */
export function contrast(a: Linear, b: Linear): number {
  const la = luminance(a),
    lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` at `alpha` over `bg`, blended in encoded sRGB as a browser does. */
export function over(fg: Linear, alpha: number, bg: Linear): Linear {
  return fg.map((f, i) => decode(encode(f) * alpha + encode(bg[i]!) * (1 - alpha))) as Linear;
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
