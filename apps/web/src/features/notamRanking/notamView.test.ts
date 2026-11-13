import { describe, expect, it } from "vitest";
import type { RankedNotam } from "./engineRanking";
import { ALL_NOTAMS, arrangeNotams, showsAll } from "./notamView";

const notam = (id: string, rank: number, over: Partial<RankedNotam> = {}): RankedNotam => ({
  id,
  kind: "notam",
  label: `NOTAM ${id}`,
  why: id,
  top: rank <= 2,
  rank,
  score: 1,
  tied: false,
  field: null,
  in_force: true,
  reasons: [],
  raw: `!${id}`,
  starts: null,
  ends: null,
  ...over,
});

const NOTAMS = [
  notam("A", 1, { starts: "2026-11-10T14:00:00Z" }),
  notam("B", 2, { starts: "2026-11-09T09:00:00Z" }),
  notam("C", 3, { kind: "tfr", starts: "2026-11-11T00:00:00Z" }),
  notam("D", 4, { in_force: false }),
];
const NONE = { pinned: [], read: [] };
const ids = (list: RankedNotam[]) => list.map((n) => n.id);

describe("arrangeNotams", () => {
  it("says the engine's top ones first and folds the rest, in rank", () => {
    const out = arrangeNotams(NOTAMS, ALL_NOTAMS, "rank", NONE);
    expect(ids(out.top)).toEqual(["A", "B"]);
    expect(ids(out.rest)).toEqual(["C", "D"]);
    expect(out.hidden).toBe(0);
  });

  it("puts a pinned one first and folds a read one, dropping neither", () => {
    const out = arrangeNotams(NOTAMS, ALL_NOTAMS, "rank", { pinned: ["D"], read: ["A"] });
    expect(ids(out.top)).toEqual(["D", "B"]);
    expect(ids(out.rest)).toEqual(["A", "C"]);
  });

  it("filters by kind, by when and by read, and counts what it leaves out", () => {
    const tfrs = arrangeNotams(NOTAMS, { ...ALL_NOTAMS, kinds: ["tfr"] }, "rank", NONE);
    expect(ids([...tfrs.top, ...tfrs.rest])).toEqual(["C"]);
    expect(tfrs.hidden).toBe(3);
    const now = arrangeNotams(NOTAMS, { ...ALL_NOTAMS, when: ["now"] }, "rank", NONE);
    expect(now.hidden).toBe(1);
    const unread = arrangeNotams(NOTAMS, { ...ALL_NOTAMS, read: false }, "rank", { pinned: ["B"], read: ["A", "B"] });
    // A pinned one stays, read or not.
    expect(ids([...unread.top, ...unread.rest])).toEqual(["B", "C", "D"]);
  });

  it("sorts by the newest start or the soonest, those with none last", () => {
    const newest = arrangeNotams(NOTAMS, ALL_NOTAMS, "newest", NONE);
    // The top ones stay apart from the rest, each sorted within.
    expect(ids(newest.top)).toEqual(["A", "B"]);
    const all = (sort: "newest" | "soonest") => {
      const out = arrangeNotams(
        NOTAMS.map((n) => ({ ...n, top: false })),
        ALL_NOTAMS,
        sort,
        NONE,
      );
      return ids(out.rest);
    };
    expect(all("newest")).toEqual(["C", "A", "B", "D"]);
    expect(all("soonest")).toEqual(["B", "A", "C", "D"]);
  });
});

describe("showsAll", () => {
  it("is the filter that leaves nothing out", () => {
    expect(showsAll(ALL_NOTAMS)).toBe(true);
    expect(showsAll({ ...ALL_NOTAMS, read: false })).toBe(false);
    expect(showsAll({ ...ALL_NOTAMS, kinds: ["notam"] })).toBe(false);
  });
});
