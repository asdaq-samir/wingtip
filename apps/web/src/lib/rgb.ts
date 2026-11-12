/** A token's "#rrggbb" as its red, green and blue, 0 to 255: what deck.gl,
 *  weatherlayers-gl and a luminance sum take where a stylesheet does not
 *  reach. The one place the web reads a hex colour, which four files once
 *  wrote each; culori stays the tests' (lib/contrast), off the first load. */
export function rgbOf(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
