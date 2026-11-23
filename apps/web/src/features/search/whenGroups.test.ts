import { describe, expect, test } from "vitest";
import { whenGroups } from "./whenGroups";

const route = (at: number) => ({ dep: "C81", dest: "KDLH", stops: [], at });

describe("whenGroups", () => {
  test("Today, This Week, This Month and Earlier, as Maps' Recents head them, empty ones left out", () => {
    const now = new Date(2026, 9, 28, 15).getTime();
    const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).getTime();
    const groups = whenGroups(
      [route(at(28)), route(at(27, 23)), route(at(22)), route(at(21, 23)), route(at(1)), route(new Date(2026, 8, 20).getTime())],
      now,
    );
    expect(groups.map((g) => [g.title, g.routes.length])).toEqual([
      ["Today", 1],
      ["This Week", 2],
      ["This Month", 2],
      ["Earlier", 1],
    ]);
    expect(whenGroups([route(at(3))], now).map((g) => g.title)).toEqual(["This Month"]);
  });

  test("counts the week in calendar days across a change of clocks, not in 24-hour days", () => {
    // The U.S. clocks went back on 1 November 2026: from Thursday the 5th,
    // the week starts at midnight on Friday 30 October, local time,
    // whatever the zone the test runs in.
    const now = new Date(2026, 10, 5, 15).getTime();
    const justAfter = new Date(2026, 9, 30, 0, 30).getTime();
    const justBefore = new Date(2026, 9, 29, 23, 30).getTime();
    expect(whenGroups([route(justAfter)], now).map((g) => g.title)).toEqual(["This Week"]);
    expect(whenGroups([route(justBefore)], now).map((g) => g.title)).toEqual(["This Month"]);
    // And forward again on 8 March: from Saturday the 14th, the week starts
    // at midnight on Sunday the 8th, not at 23:00 the night before.
    const spring = new Date(2026, 2, 14, 15).getTime();
    expect(whenGroups([route(new Date(2026, 2, 7, 23, 30).getTime())], spring).map((g) => g.title)).toEqual(["This Month"]);
  });
});
