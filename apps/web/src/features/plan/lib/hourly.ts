import type { Metar } from "../../../lib/api/types";
import { callEngine } from "../../../lib/engine/engine";
import { categoryOf } from "../../../lib/map/marks/flightCategory";
import { clockTime } from "../../../lib/format";
import { altFt } from "../../../lib/format";

/**
 * A field's weather hour by hour, as Apple's Weather lays out its hourly
 * forecast, for the airport card (HourlyForecast): Now from the METAR,
 * then each whole hour the field's TAF covers, and one plain sentence of
 * what it says -- written here from the figures, the same words for the
 * same forecast, no model in it.
 *
 * The hours are the shared engine's (`field_hours`, engine/crates/weather/
 * src/forecast/hours.rs): it reads the TAF as sent and its change groups
 * as FAA-H-8083-28B 27.4.2.10 (Aviation Weather Handbook) sets them out -- the first
 * line and each FM group the prevailing weather until the next; a BECMG
 * a change somewhere in its window that holds after it, so until it is
 * done the hour is the worse of before and after; a TEMPO, PROB or INTER
 * group weather that comes and goes, not the hour's bar but its "at
 * times" (`atTimes`), drawn lighter under it and said in the sentence.
 * The ceiling is 14 CFR 1.1's and the flight category AIM 7-1-7's. This
 * file only writes the sentence and finds the arrival's hour.
 */

const HOUR_MS = 3_600_000;
/** How many hours after Now: a TAF covers 24 or 30 (FAA-H-8083-28B 27.4.1). */
const HOURS = 24;
/** How far ahead the sentence looks: a flight's day, not the TAF's end. */
const SENTENCE_HOURS = 12;

/** What the sky is, for the hour's glyph: clear (or no cloud said),
 *  few or scattered, and broken, overcast or obscured. */
type Sky = "clear" | "partly" | "cloudy";
/** The weather worth a glyph of its own, the worst first. */
type Precip = "thunder" | "snow" | "rain";

export interface Hour {
  /** The hour's start, ms; Now's is the report's time (or now). */
  at: number;
  now: boolean;
  category: string | null;
  ceilingFt: number | null;
  visibilitySm: number | null;
  sky: Sky | null;
  precip: Precip | null;
  /** True, as reports and forecasts give it; null where variable. */
  windDirTrueDeg: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  /** A TEMPO's or PROB's category this hour where it is worse than the
   *  prevailing one: the weather at times. */
  atTimes: string | null;
  /** The strongest gust at times, where it is above the prevailing's. */
  atTimesGustKt: number | null;
  /** Thunder at times, where the prevailing has none. */
  atTimesThunder: boolean;
  /** The worse weather at times comes only from a PROB group: a chance
   *  of it (30 or 40 per cent), not weather expected now and then as a
   *  TEMPO's is (FAA-H-8083-28B 27.4.2.10.2, .3, the TAF's TEMPO and PROB groups). */
  atTimesChance: boolean;
}

/** The categories from best to worst, for the sentence's "lowering" and
 *  "improving" (the hour's own reading ranks them in the engine). */
const RANK: Record<string, number> = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 };
const rank = (category: string | null) => (category ? (RANK[category] ?? -1) : -1);

/** Now and the hours after it, the engine's (`field_hours`): Now the
 *  METAR's, or with none the TAF's for this moment; then each whole hour
 *  the TAF (as sent) covers, up to `count`. */
export function hoursOf({
  metar,
  taf,
  now,
  count = HOURS,
}: {
  metar: Metar | null;
  taf: string | null;
  now: number;
  count?: number;
}): Hour[] {
  return callEngine("field_hours", { metar: metar ?? null, taf: taf || null, now, count }).map((h) => ({
    at: h.at,
    now: h.now,
    category: h.category,
    ceilingFt: h.ceiling_ft,
    visibilitySm: h.visibility_sm,
    sky: h.sky,
    precip: h.precip,
    windDirTrueDeg: h.wind_dir_true_deg,
    windSpeedKt: h.wind_speed_kt,
    windGustKt: h.wind_gust_kt,
    atTimes: h.at_times,
    atTimesGustKt: h.at_times_gust_kt,
    atTimesThunder: h.at_times_thunder,
    atTimesChance: h.at_times_chance,
  }));
}

/** "17:00": this device's clock, as the Brief writes a forecast's times. */
const clock = (ms: number) => clockTime(new Date(ms));

/**
 * The forecast in a sentence or two, over the hours: when the category
 * changes in the next twelve hours, to what and until when -- led by
 * what changes it, the ceiling or the visibility -- or that it stays;
 * the worse weather a TEMPO or PROB gives at times; thunderstorms; and
 * the strongest gust. With no TAF, the category now and that there is no
 * forecast. Null with nothing to say from.
 */
export function sentenceOf(hours: Hour[], time: (ms: number) => string = clock): string | null {
  if (!hours.length) return null;
  const forecast = hours.filter((h) => !h.now);
  const first = hours[0]!;
  if (!forecast.length) return first.category ? `${first.category} now, no forecast for this field.` : "No forecast for this field.";
  const within = hours.filter((h) => h.at <= first.at + SENTENCE_HOURS * HOUR_MS);
  const last = hours.at(-1)!;
  const said: string[] = [];

  const from = within.findIndex((h) => h.category != null);
  const was = from >= 0 ? within[from]!.category! : null;
  const change = was ? within.findIndex((h, i) => i > from && h.category != null && h.category !== was) : -1;
  if (was && change >= 0) {
    const turn = within[change]!;
    const to = turn.category!;
    const after = hours.findIndex((h) => h.at > turn.at && h.category != null && h.category !== to);
    const lasting = after >= 0 ? `until ${time(hours[after]!.at)}` : `through ${time(last.at)}`;
    if (rank(to) > rank(was)) {
      // Led by what brings it down: the ceiling where it alone would make
      // the category, else the visibility.
      const byCeiling = turn.ceilingFt != null && rank(categoryOf(turn.ceilingFt, Infinity)) >= rank(to);
      said.push(
        byCeiling
          ? `Ceilings lowering to ${altFt(turn.ceilingFt)} ft around ${time(turn.at)}, ${to} ${lasting}.`
          : turn.visibilitySm != null
            ? `Visibility down to ${turn.visibilitySm} sm around ${time(turn.at)}, ${to} ${lasting}.`
            : `${to} from around ${time(turn.at)} ${lasting}.`,
      );
    } else {
      said.push(`${was} ${within[from]!.now ? "now" : "at first"}, ${to} from around ${time(turn.at)}${after >= 0 ? ` ${lasting}` : ""}.`);
    }
  } else if (was) {
    said.push(`Staying ${was} through ${time(within.at(-1)!.at)}.`);
  }

  // The first stretch of worse weather at times, from its first hour to
  // the end of its last.
  const start = within.findIndex((h) => h.atTimes != null);
  if (start >= 0) {
    const worst = within[start]!.atTimes!;
    let end = start;
    while (end + 1 < within.length && within[end + 1]!.atTimes != null) end++;
    // "Chance of" where only a PROB group says so, as the TAF means it.
    const chance = within.slice(start, end + 1).every((h) => h.atTimesChance);
    said.push(`${chance ? "Chance of" : "At times"} ${worst} between ${time(within[start]!.at)} and ${time(within[end]!.at + HOUR_MS)}.`);
  }

  const storm = within.find((h) => h.precip === "thunder" || h.atTimesThunder);
  if (storm) said.push(storm.now ? "Thunderstorms now." : `Thunderstorms around ${time(storm.at)}.`);

  const gusts = within.flatMap((h) => [h.windGustKt, h.atTimesGustKt]).filter((g): g is number => g != null && g > 0);
  if (gusts.length) said.push(`Gusts up to ${Math.round(Math.max(...gusts))} kt.`);

  return said.length ? said.join(" ") : null;
}

/** The hour a planned arrival falls in, its index in `hours`; null where
 *  it is before Now or past the last hour. */
export function arrivalHour(hours: Hour[], arrivalMs: number | null): number | null {
  if (arrivalMs == null || !hours.length) return null;
  const first = hours[0]!;
  if (arrivalMs < Math.floor(first.at / HOUR_MS) * HOUR_MS || arrivalMs >= hours.at(-1)!.at + HOUR_MS) return null;
  let found = 0;
  hours.forEach((h, i) => {
    if (!h.now && h.at <= arrivalMs) found = i;
  });
  return found;
}
