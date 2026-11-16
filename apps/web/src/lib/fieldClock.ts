/**
 * A field's own clock, in the time zone it keeps (the planner's
 * `time_zone`, an IANA name from where the field is): its date, weekday
 * and minute of the day now, its offset from UTC and whether it is on
 * daylight saving time -- what the engine's surface_hours is asked with,
 * the engine having no clock of its own. Read with the platform's own
 * time-zone data (Intl), one formatter a zone, made the first time.
 */
export interface FieldClock {
  year: number;
  month: number;
  day: number;
  /** Monday 0 to Sunday 6. */
  weekday: number;
  /** Minutes since the field's midnight. */
  minute: number;
  /** Minutes from UTC: UTC-6 is -360. */
  utcOffsetMin: number;
  dst: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const formats = new Map<string, Intl.DateTimeFormat | null>();

function formatOf(timeZone: string): Intl.DateTimeFormat | null {
  if (!formats.has(timeZone)) {
    try {
      const options = { timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "numeric", day: "numeric" } as const;
      formats.set(timeZone, new Intl.DateTimeFormat("en-US", { ...options, hour: "numeric", minute: "numeric" }));
    } catch {
      // A zone this browser does not know: no clock, the hours said as not known.
      formats.set(timeZone, null);
    }
  }
  return formats.get(timeZone) ?? null;
}

function wall(format: Intl.DateTimeFormat, at: Date) {
  const parts = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
  const [year, month, day, hour, minute] = [parts.year, parts.month, parts.day, parts.hour, parts.minute].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  // The wall clock read as if UTC, less the instant: the zone's offset then.
  const offset = Math.round((Date.UTC(year, month - 1, day, hour, minute) - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
  return { year, month, day, hour, minute, weekday: WEEKDAYS.indexOf(parts.weekday ?? ""), offset };
}

/** The field's clock at `at`; null where the zone is not known. */
export function fieldClock(timeZone: string | null | undefined, at: Date): FieldClock | null {
  const format = timeZone ? formatOf(timeZone) : null;
  if (!format) return null;
  const now = wall(format, at);
  // Its standard offset the lower of January's and July's (the US's
  // zones; one with no daylight saving time has the two the same).
  const standard = Math.min(
    wall(format, new Date(Date.UTC(now.year, 0, 1))).offset,
    wall(format, new Date(Date.UTC(now.year, 6, 1))).offset,
  );
  return {
    year: now.year,
    month: now.month,
    day: now.day,
    weekday: now.weekday,
    minute: now.hour * 60 + now.minute,
    utcOffsetMin: now.offset,
    dst: now.offset > standard,
  };
}
