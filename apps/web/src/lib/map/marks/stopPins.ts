import type { Layout } from "../gl/markLayers";
import { svgPicture, type GlPicture } from "../gl/useGlSymbols";
import { STOP_KINDS, type StopKind } from "../../stopKinds";
import { BADGE, CHART } from "../../tokens";

/** A stop's pin: the fuel stop's amber, its glyph in white (lucide's), its
 *  point in the middle of the field's mark drawn under it (StopPin), as
 *  Tesla's trip map pins its chargers (the owner's screenshot,
 *  2026-10-21) -- the field under the pin, with its ident, at the owner's
 *  asks ("Put airports under the fuel markers"; "at the middle of the
 *  airport markers", 2026-10-26). */
function stopPin(id: string, glyph: string): GlPicture {
  return svgPicture(
    id,
    () =>
      `<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37C15 37 2 23.5 2 14a13 13 0 0 1 26 0c0 9.5-13 23-13 23z" fill="${BADGE.stopFuel}" stroke="${CHART.casing}" stroke-width="2"/>` +
      `<g transform="translate(7.5 6.5) scale(0.62)" fill="none" stroke="${CHART.casing}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`,
  );
}
/** Where a pin's tip is on its point: the picture's bottom left moved
 *  15 points left and one down (its tip at 15, 37 of a 30 by 38 pin, and
 *  of a stack, whose first pin is at its left). */
export const PIN_PLACE: Layout = { "icon-anchor": "bottom-left", "icon-offset": [-15, 1] };

/** A suggested fuel stop's: the pump (lucide's Fuel). */
export const FUEL_PIN = stopPin(
  "pin|fuel",
  '<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
);
/** A break's on a long flight the tanks hold (fuelstops.suggest_break): a cup (lucide's Coffee). */
export const BREAK_PIN = stopPin(
  "pin|break",
  '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
);
/** A suggested stop pinned on the chart (the totals' fuel_stops). */
export type StopPin = { ident: string; lat: number; lon: number; reason?: "fuel" | "break" };

/** A field's stacked pins (the owner's pick of the Stops canvas, I,
 *  2026-10-27): one teardrop for each kind it has, in the kind's colour
 *  with its glyph in white, each fanned eight points right and four up
 *  from the one before so every glyph shows, the first kind in front, its
 *  tip on the field. One picture each set of kinds. */
export function stackedPin(kinds: StopKind[]): GlPicture {
  return svgPicture(`pins|${kinds.join(",")}`, () => stackSvg(kinds));
}

function stackSvg(kinds: StopKind[]): string {
  const n = kinds.length;
  const width = 30 + (n - 1) * 8,
    height = 38 + (n - 1) * 4;
  // Back to front: the last kind drawn first, behind the others.
  const pins = kinds
    .map((kind, i) => {
      const { colour, paths } = STOP_KINDS[kind];
      const glyph = paths.map((d) => `<path d="${d}"/>`).join("");
      return (
        `<g transform="translate(${i * 8} ${(n - 1 - i) * 4})"><path d="M15 37C15 37 2 23.5 2 14a13 13 0 0 1 26 0c0 9.5-13 23-13 23z" fill="${colour}" stroke="${CHART.casing}" stroke-width="2"/>` +
        `<g transform="translate(7.5 6.5) scale(0.62)" fill="none" stroke="${CHART.casing}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></g>`
      );
    })
    .reverse()
    .join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${pins}</svg>`;
}
