import { describe, expect, test } from "vitest";
import {
  dayMonth,
  dayMonthTime,
  dayMonthYear,
  fromIso,
  monthSlashDay,
  strictDistance,
  usFormDay,
  weekdayDayMonthTime,
  weekdayShort,
} from "./days";

// In the test's own zone: each is made from the date's local fields.
const at = new Date(2026, 0, 5, 9, 7);

describe("the days the app writes", () => {
  test("in the patterns date-fns wrote them", () => {
    expect(weekdayShort(at)).toBe("Mon");
    expect(dayMonth(at)).toBe("5 Jan");
    expect(dayMonthYear(at)).toBe("5 Jan 2026");
    expect(dayMonthTime(at)).toBe("5 Jan, 09:07");
    expect(weekdayDayMonthTime(at)).toBe("Mon 5 Jan, 09:07");
    expect(monthSlashDay(at)).toBe("1/5");
    expect(usFormDay(at)).toBe("01-05-2026");
  });

  test("a bare ISO day is this device's midnight; a time is read as sent", () => {
    expect(fromIso("2026-10-13").getTime()).toBe(new Date(2026, 9, 13).getTime());
    expect(fromIso("2026-10-13T12:00:00Z").getTime()).toBe(Date.UTC(2026, 9, 13, 12));
  });

  test("a distance in the one unit that fits", () => {
    const t = at.getTime();
    expect(strictDistance(t + 30_000, t)).toBe("30 seconds");
    expect(strictDistance(t, t + 60_000)).toBe("1 minute");
    expect(strictDistance(t + 3 * 3_600_000, t)).toBe("3 hours");
    expect(strictDistance(t + 86_400_000, t)).toBe("1 day");
    expect(strictDistance(t + 14 * 86_400_000, t)).toBe("14 days");
    expect(strictDistance(t + 60 * 86_400_000, t)).toBe("2 months");
    expect(strictDistance(t + 400 * 86_400_000, t)).toBe("1 year");
  });
});
