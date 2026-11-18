import type { ApproachFixTag } from "../../lib/engine/contract";
import { altFt } from "../../lib/format/figures";
import { altitudeLines } from "../../lib/procedures";

/** One line of a fix's tag, and the FAA's bar on it: under for at or
 *  above, over for at or below, both for at (the d-TPP legend's
 *  minimum, maximum and mandatory altitudes; the bars are the engine's
 *  altitude_lines). */
interface TagLine {
  text: string;
  under: boolean;
  over: boolean;
}

/** What a fix's tag says, ForeFlight's way (the owner's screenshot,
 *  2026-11-11): its name, its crossing altitude barred as the plate
 *  bars it, the glide slope's or glidepath's altitude at the FAF, and at
 *  a runway its TCH and TDZE; each figure as every map tag writes one,
 *  "2,700", feet with no unit and no tick (the owner's pick, 2026-11-18),
 *  as the plate under it prints its own. */
export interface TagView {
  key: string;
  ident: string;
  lat: number;
  lon: number;
  lines: TagLine[];
}

const plain = (text: string): TagLine => ({ text, under: false, over: false });

/**
 * The tags the engine answers (approach_fix_tags) as the map writes them.
 * Every figure is the engine's: this only prints them. A fix the engine
 * gives nothing to say of but its name is still tagged, as ForeFlight
 * names each fix of the approach; the missed approach's fixes are left to
 * the procedure's own marks but for its hold, which the plate names.
 * No DA or MDA at the runway: the CIFP carries neither (the plate's
 * minimums are the pilot's to read), so its TCH and TDZE are what is
 * said there.
 */
export function tagViews(tags: ApproachFixTag[]): TagView[] {
  return tags
    .filter((t) => !t.missed || t.roles.includes("hold"))
    .map((t) => {
      const lines: TagLine[] = t.altitude ? altitudeLines({ min_ft: t.altitude.min_ft, max_ft: t.altitude.max_ft }).lines : [];
      // "GS" an ILS's glide slope, "GP" an RNAV approach's glidepath
      // (the plate's profile view writes them so).
      if (t.vertical) lines.push(plain(`${t.vertical.kind === "glideslope" ? "GS" : "GP"} ${altFt(t.vertical.ft)}`));
      if (t.runway) {
        lines.push(plain(`TCH ${altFt(t.runway.tch_ft)}`));
        if (t.runway.tdze_ft != null) lines.push(plain(`TDZE ${altFt(t.runway.tdze_ft)}`));
      }
      return { key: `${t.ident}-${t.missed ? "missed" : "approach"}`, ident: t.ident, lat: t.lat, lon: t.lon, lines };
    });
}
