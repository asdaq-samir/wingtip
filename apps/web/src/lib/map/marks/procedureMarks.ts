import type { ProcedureFix } from "../../api/types";
import { altitudeLines, speedWords } from "../../procedures";
import { altFt } from "../../format";
import { BADGE } from "../../rowBadges";
import { MAP_BLUE } from "./chartColors";
import { drawTag, type TagLine } from "../gl/drawTag";
import { svgPicture, type GlPicture } from "../gl/useGlSymbols";
import { CHART } from "../../tokens";

/**
 * The instrument procedures the pilot picked (the route's Procedures), on
 * the chart as ForeFlight draws one, at the pilot's showing (the ILS Y RWY
 * 8 at KBUR via LAX): the transition and the final in the approaches'
 * indigo over a white casing, the missed approach dashed, each hold its
 * racetrack, and each fix a mark with its name, its part (IAF, FAF, MAP)
 * and the altitudes it is crossed at as the chart sets them -- a minimum
 * underlined, a maximum overlined, a mandatory one both. From the FAA's
 * coded procedure (wingtip.procedures), drawn as a sketch, the chart under it.
 * A fix of the procedure's own is tapped for its card (FixCard: Direct to
 * it, an altitude to cross it at), at the owner's pick; the pilot's own
 * altitude there said under the chart's in the tint, and the fix sent
 * direct to ringed in it. One of an older cycle than the one in force (the
 * FAA's current file could not be had) is drawn in grey, its fixes
 * saying OUT OF DATE, so it is not read as current once the sheet is closed.
 */
export const PROCEDURE_INK = BADGE.approach;
/** A procedure of an old cycle: grey, not the approaches' indigo. */
export const STALE_INK = CHART.fieldUnknown;

/** From this zoom in, the fixes' names and altitudes: further out an
 *  approach is a short line by its field, and its words would cover it. */
export const PROCEDURE_WORDS_FROM_ZOOM = 9;

/** A fix's marks: its diamond, and from PROCEDURE_WORDS_FROM_ZOOM its tag
 *  beside it -- its name, its part, the altitudes with the chart's bars,
 *  its speed, the pilot's own crossing altitude and Direct to in the
 *  tint, OUT OF DATE on a stale one. A runway's threshold (the missed
 *  approach point of most approaches) is under the field's own mark and
 *  its ident: its diamond alone, where "RW08 MAP" covered the field's
 *  name (2026-10-10). */
export function fixMarks(fix: ProcedureFix, words: boolean, stale: boolean, own: number | null, direct: boolean) {
  const ink = stale ? STALE_INK : PROCEDURE_INK;
  const diamond = svgPicture(
    `proc-fix|${ink}|${fix.missed ? 1 : 0}|${direct ? 1 : 0}`,
    () =>
      `<svg width="24" height="24" viewBox="-12 -12 24 24">${direct ? `<circle r="10" fill="none" stroke="${MAP_BLUE}" stroke-width="2.5"/>` : ""}` +
      `<path d="M0 -5.5 L5.5 0 L0 5.5 L-5.5 0 Z" fill="${fix.missed ? CHART.casing : ink}" stroke="${fix.missed ? ink : CHART.casing}" stroke-width="1.8"/></svg>`,
  );
  if (!words || /^RW\d/.test(fix.ident)) return { diamond, tag: null };
  const roles = fix.roles.filter((r) => r !== "hold");
  const run = (text: string, colour: string) => ({ runs: [{ text, colour }] });
  const lines: TagLine[] = [
    {
      runs: [
        { text: fix.ident, colour: ink },
        ...(roles.length ? [{ text: ` ${roles.join(" ")}`, colour: ink, weight: 600, opacity: 0.8 }] : []),
      ],
    },
    ...altitudeLines(fix).lines.map((l) => ({ ...run(l.text, CHART.fixInk), under: l.under, over: l.over })),
  ];
  const speed = speedWords(fix);
  if (speed) lines.push(run(speed, CHART.fixInk));
  if (own != null) lines.push(run(`Cross ${altFt(own)}`, MAP_BLUE));
  if (direct) lines.push(run("Direct to", MAP_BLUE));
  if (stale) lines.push(run("OUT OF DATE", CHART.fixInk));
  const tag: GlPicture = {
    id: `proc-tag|${JSON.stringify(lines)}`,
    draw: () => drawTag({ lines, background: `${CHART.casing}f2`, size: 13, lineHeight: 16, padX: 6, padY: 2, radius: 6 }),
  };
  return { diamond, tag };
}
