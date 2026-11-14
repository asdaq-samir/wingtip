import type { AirportPlace } from "../../../../lib/api/types";
import { callEngine, type EngineAnswer } from "../../../../lib/engine/engine";
import { fieldClock } from "../../../../lib/fieldClock";
import { twoFigures } from "../../../../lib/format";

/**
 * A part-time surface area's hours, as the airport card says them: the
 * Airspace fact's one short note ("G after 22:00", "D from 06:00") and the
 * Info tab's Airspace hours, today's and the week's, as Apple Maps writes
 * a place's opening hours (the owner, 2026-11-14). The hours are the
 * engine's (surface_hours: NASR's CLS_ARSP AIRSPACE_HRS, AIM 3-2-5a1), read
 * at the field's own clock (lib/fieldClock); "Part-time" alone wherever
 * they cannot be known, never a guess.
 */
export type SurfaceHours = EngineAnswer<"surface_hours">;

/** The field's hours now, from the engine; null where it has no hours line or no clock. */
export function surfaceHoursAt(place: Pick<AirportPlace, "airspace_hours" | "time_zone">, at: number): SurfaceHours | null {
  const clock = place.airspace_hours ? fieldClock(place.time_zone, new Date(at)) : null;
  if (!clock) return null;
  return callEngine("surface_hours", {
    hours: place.airspace_hours,
    year: clock.year,
    month: clock.month,
    day: clock.day,
    weekday: clock.weekday,
    minute: clock.minute,
    utc_offset_min: clock.utcOffsetMin,
    dst: clock.dst,
  });
}

/** Minutes from midnight as the app writes a clock time: "06:00"; midnight "00:00". */
const clock = (minute: number) => `${twoFigures(Math.floor(minute / 60) % 24)}:${twoFigures(minute % 60)}`;

/** A day's spans as times, "06:00–22:00"; all day "All day". */
function spansWords(spans: { from: number; to: number }[]): string {
  if (spans.length === 1 && spans[0]!.from === 0 && spans[0]!.to >= 1440) return "All day";
  return spans.map((s) => `${clock(s.from)}–${clock(s.to)}`).join(", ");
}

/** The class in force at the field now: the part-time one while in effect,
 *  the line's class at other times outside it; null where not known. */
export function classNow(surface: AirportPlace["surface_airspace"], hours: SurfaceHours | null): string | null {
  if (!surface) return null;
  if (!surface.part_time || !hours?.known || hours.in_force == null) return surface.class;
  return hours.in_force ? surface.class : (hours.other ?? null);
}

/** The Airspace fact's note: the day's next change, "G after 22:00" or
 *  "D from 06:00"; "Part-time" where it is not known today; none for a
 *  full-time class or a part-time one in effect all day. */
export function changeNote(surface: AirportPlace["surface_airspace"], hours: SurfaceHours | null): string | null {
  if (!surface?.part_time) return null;
  if (!hours?.known || hours.in_force == null) return "Part-time";
  if (!hours.change) return hours.in_force ? null : "Part-time";
  if (hours.in_force) return hours.other ? `${hours.other} after ${clock(hours.change.at)}` : "Part-time";
  return `${surface.class} from ${clock(hours.change.at)}`;
}

/** Today's times beside the class in force, "06:00–22:00, then E"; "E all
 *  day" where the part-time class is not in effect today. */
export function todayWords(hours: SurfaceHours): string | null {
  const today = hours.days[0];
  if (!hours.known || !today?.spans) return null;
  if (!today.spans.length) return hours.other ? `${hours.other} all day` : "Not today";
  const times = spansWords(today.spans);
  return times === "All day" || !hours.other ? times : `${times}, then ${hours.other}`;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The week as Maps' Normal Hours lists it, Monday first, days alike
 *  grouped: [{days: "Mon – Fri", times: "06:00–22:00", today}]. */
export function normalHours(hours: SurfaceHours): { days: string; times: string; today: boolean }[] {
  const todayIs = hours.days[0]?.weekday;
  const byDay = [...hours.days].sort((a, b) => a.weekday - b.weekday);
  const words = byDay.map((d) =>
    d.spans == null ? "Not known" : d.spans.length ? spansWords(d.spans) : `${hours.other ?? "Not in effect"} all day`,
  );
  const rows: { days: string; times: string; today: boolean }[] = [];
  for (let i = 0; i < byDay.length;) {
    let j = i;
    while (j + 1 < byDay.length && words[j + 1] === words[i]) j++;
    const first = DAY_NAMES[byDay[i]!.weekday]!;
    const last = DAY_NAMES[byDay[j]!.weekday]!;
    const today = byDay.slice(i, j + 1).some((d) => d.weekday === todayIs);
    rows.push({ days: i === j ? first : `${first} – ${last}`, times: words[i]!, today });
    i = j + 1;
  }
  return rows;
}
