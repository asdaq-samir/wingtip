/** A token's "#rrggbb" as its red, green and blue, 0 to 255: what deck.gl,
 *  weatherlayers-gl and a luminance sum take where a stylesheet does not
 *  reach. The one place the web reads a hex colour, which four files once
 *  wrote each; culori stays the tests' (lib/contrast), off the first load. */
export function rgbOf(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** A "#rrggbb" with an alpha, 0 to 1, as "#rrggbbaa", which MapLibre's
 *  colours read: a line's see-through in its colour, by feature, where an
 *  opacity by feature times the Dimmer had MapLibre lay its source out
 *  again at each move of the slider (useGlLines). Any other colour as it is. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || alpha >= 1) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, "0")}`;
}

/** An encoded sRGB channel, 0 to 1, as light (WCAG 2's relative luminance). */
const linearOf = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A "#rrggbb"'s relative luminance, 0 to 1 (WCAG 2). */
export function luminanceOf(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => linearOf(v / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** A "#rrggbb" times `k` in encoded sRGB, as MapLibre's interpolate from
 *  black to it gives at `k`, and the chart's raster-brightness-max dims. */
export function scaledHex(hex: string, k: number): string {
  const f = Math.min(1, Math.max(0, k));
  return `#${rgbOf(hex)
    .map((v) =>
      Math.round(v * f)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
