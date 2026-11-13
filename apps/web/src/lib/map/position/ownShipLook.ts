import { CHART } from "../../tokens";
/**
 * Own ship on the chart: a plane seen from above, nose up, turned to the
 * GPS's heading, at the owner's ask ("can we change the current location
 * marker on map to be a plane"), and always the plane since the owner took
 * its picker out (2026-11-13: You on the Map, with the arrow, the twin and
 * the jet it offered). As SVG in a 32-point box: drawn once in a white
 * casing and once in its colour over it, so the outline holds over any
 * chart and the parts read as one.
 */

/** The plane's parts, in a 32 by 32 box, nose to the top: a high wing's
 * span straight across, its tail at the back -- drawn, not blocks, at the
 * owner's ask ("redesign the ship to look modern"): a fuselage tapering to
 * the tail, the wing's tips rounded and its trailing edge swept in to the
 * cabin, a rounded tailplane. */
const PARTS =
    `<path d="M16 2 C17.3 2 18 3.6 18 5.6 L18 21.5 C18 24 17.3 27 16 29.5 C14.7 27 14 24 14 21.5 L14 5.6 C14 3.6 14.7 2 16 2 Z"/>` +
    `<path d="M3.2 10 L28.8 10 Q30 10 30 11.2 L30 12.4 Q30 13.4 28.9 13.5 L18 14.8 L14 14.8 L3.1 13.5 Q2 13.4 2 12.4 L2 11.2 Q2 10 3.2 10 Z"/>` +
    `<path d="M10.6 24 L21.4 24 Q22.2 24 22.2 24.8 L22.2 25.6 Q22.2 26.4 21.4 26.4 L10.6 26.4 Q9.8 26.4 9.8 25.6 L9.8 24.8 Q9.8 24 10.6 24 Z"/>`;

/** The plane's SVG at `size` points, `fill` over a white casing. Moving
 * (`beam`), the plane with Maps' fading beam ahead of its nose and a faint
 * halo round it, so where it is going reads at a glance; still, the drawn
 * plane alone, at the owner's pick ("1 when still and 3 when moving",
 * from the canvas's own-ship row). The beam's box is twice the plane's,
 * the plane at its middle, so the marker's anchor stays the airplane. */
export function ownShipSvg(fill: string, size = 32, attrs = "", beam = false): string {
  const plane = `<g fill="${CHART.casing}" stroke="${CHART.casing}" stroke-width="2.6" stroke-linejoin="round">${PARTS}</g><g fill="${fill}">${PARTS}</g>`;
  if (beam) {
    return (
      `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" ${attrs}>` +
      `<defs><radialGradient id="own-ship-beam" cx="32" cy="32" r="31" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0.25" stop-color="${fill}" stop-opacity="0.45"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></radialGradient></defs>` +
      `<path d="M32 32 L17 3 A31 31 0 0 1 47 3 Z" fill="url(#own-ship-beam)"/>` +
      `<circle cx="32" cy="32" r="14" fill="${fill}" fill-opacity="0.12"/>` +
      `<g transform="translate(16 16)">${plane}</g></svg>`
    );
  }
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" ${attrs}>${plane}</svg>`;
}
