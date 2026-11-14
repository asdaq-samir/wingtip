import { CHART } from "../../tokens";

/**
 * The pictures of the airport weather marks (the owner's pick,
 * 2026-11-10, the canvas's "Recommended"): the station model's wind barb
 * and the getting-worse badge, drawn once a page with the overlays' other
 * pictures (glOverlays' overlayPictures) for the map to take as a layer
 * asks for one. The barb is the map's one wind mark at every zoom, as the
 * Aviation Weather Center's map draws the wind (the owner, 2026-11-12, in
 * place of the arrow). Each is drawn pointing north from the field and
 * turned on the map by the wind's direction (icon-rotate), so one picture
 * serves every direction. Brand inks only (lib/tokens).
 */

/** How far from the field a barb's stem begins, and the calm circle's
 *  radius: outside an ordinary field's mark (airportMarkSvg, its ticks'
 *  casing some 15 px out), so neither covers it. */
const CLEAR = 15;
/** A barb's stem ends this far out. */
const REACH = 36;
const BOX = REACH * 2 + 4;

/** A barb's picture id: "wx-barb|calm", or its flags, barbs and
 *  half-barbs, and "|over" where it is red: the engine's wind_arrow, the
 *  least crosswind past the airplane's demonstrated crosswind. */
export function barbId(barb: { calm: boolean; flags: number; barbs: number; half_barbs: number }, over = false): string {
  return barb.calm ? "wx-barb|calm" : `wx-barb|${barb.flags}|${barb.barbs}|${barb.half_barbs}${over ? "|over" : ""}`;
}

const line = (x1: number, y1: number, x2: number, y2: number, width: number, ink: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${width}" stroke-linecap="round"/>`;

/** The station model's wind symbol (FAA-H-8083-28B 25.2.3.4.5; the NWS's
 *  wind barb table, weather.gov/hfo/windbarbinfo; the engine's wind_barb
 *  says how many of each): a stem from the field toward where the wind is
 *  from ("the shaft will point to the direction FROM which the wind is
 *  blowing"), flags (50 kt), barbs (10) and half-barbs (5) from its far
 *  end on the clockwise side, the Northern Hemisphere's, as the Aviation
 *  Weather Center's map draws them (a west wind's feathers to the north);
 *  calm a circle round the station with no stem. A gust is not part of
 *  the station model's barb, so it is left to the field's card. Dark ink
 *  on a white casing, to read over the chart's print. */
function barbSvg(barb: { calm: boolean; flags: number; barbs: number; half_barbs: number }, over = false): string {
  const ink = over ? CHART.warning : CHART.fixInk;
  const open = `<svg width="${BOX}" height="${BOX}" viewBox="${-BOX / 2} ${-BOX / 2} ${BOX} ${BOX}">`;
  if (barb.calm) {
    const ring = (w: number, c: string) => `<circle r="${CLEAR}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
    return `${open}${ring(4.5, CHART.casing)}${ring(2, ink)}</svg>`;
  }
  // Up the page is north, out along the stem; the feathers to the right.
  const parts: string[] = [];
  const step = 5;
  let y = -REACH;
  for (let i = 0; i < barb.flags; i++, y += step + 1) parts.push(`M0 ${y}L10 ${y - 2}L0 ${y + step}Z`);
  const feathers: [number, number][] = [];
  for (let i = 0; i < barb.barbs; i++, y += step) feathers.push([y, 11]);
  // A half-barb alone stands in from the end, so it is not read as a full one.
  if (barb.half_barbs) feathers.push([barb.flags || barb.barbs ? y : y + step, 6]);
  const drawn = (w: number, c: string) =>
    line(0, -CLEAR, 0, -REACH, w, c) +
    feathers.map(([at, len]) => line(0, at, len, at - len * 0.55, w, c)).join("") +
    parts.map((d) => `<path d="${d}" fill="${c}" stroke="${c}" stroke-width="${w - 1.6}" stroke-linejoin="round"/>`).join("");
  return `${open}${drawn(4.2, CHART.casing)}${drawn(1.8, ink)}</svg>`;
}

/** The getting-worse badge: a small amber disc with a down chevron. */
export const WORSE_ID = "wx-worse";
function worseSvg(): string {
  return (
    `<svg width="16" height="16" viewBox="-8 -8 16 16"><circle r="7" fill="${CHART.caution}" stroke="${CHART.casing}" stroke-width="1.5"/>` +
    `<path d="M-3.5 -1.5L0 2.5L3.5 -1.5" fill="none" stroke="${CHART.fixInk}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/** Every barb the engine can answer for up to 195 kt, ink and red, and
 *  the badge, as [id, svg] for overlayPictures. */
export function stationPictures(): [string, () => string][] {
  const out: [string, () => string][] = [["wx-barb|calm", () => barbSvg({ calm: true, flags: 0, barbs: 0, half_barbs: 0 })]];
  for (let flags = 0; flags < 4; flags++)
    for (let barbs = 0; barbs < 5; barbs++)
      for (let half = 0; half < 2; half++) {
        const b = { calm: false, flags, barbs, half_barbs: half };
        if (flags || barbs || half) out.push([barbId(b), () => barbSvg(b)], [barbId(b, true), () => barbSvg(b, true)]);
      }
  out.push([WORSE_ID, worseSvg]);
  return out;
}
