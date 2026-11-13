import type { RankedNotam } from "./engineRanking";

/**
 * How the Brief's NOTAMs are shown, as ForeFlight 18.6 lets a pilot do
 * (web.md §6): filtered by kind (NOTAM or TFR), by when (in force now, or
 * later) and by whether read; sorted by the engine's rank, by the newest
 * start or by the soonest; pinned ones first; read ones folded with the
 * less important. Nothing is dropped: a NOTAM the filters leave out is
 * counted (`hidden`), for the section to say so with a way back to all.
 * The ranking itself is the engine's (the planner's notams_ranked); this
 * only arranges what it gave.
 */
export type NotamKind = "notam" | "tfr";
export type NotamWhen = "now" | "later";
export type NotamSort = "rank" | "newest" | "soonest";

export interface NotamFilter {
  kinds: NotamKind[];
  when: NotamWhen[];
  /** Whether the read ones are shown, folded with the rest. */
  read: boolean;
}

export const ALL_NOTAMS: NotamFilter = { kinds: ["notam", "tfr"], when: ["now", "later"], read: true };

export interface NotamMarks {
  pinned: readonly string[];
  read: readonly string[];
}

/** A TFR is said as one; anything else the feed sends is a NOTAM. */
const kindOf = (n: RankedNotam): NotamKind => (n.kind === "tfr" ? "tfr" : "notam");

/** In force while the flight is there, or later; one the engine could not
 *  place in time counts as now, the safe side to show it on. */
const whenOf = (n: RankedNotam): NotamWhen => (n.in_force === false ? "later" : "now");

/** Whether the filter is the one that shows every NOTAM. */
export const showsAll = (f: NotamFilter): boolean =>
  f.read && ALL_NOTAMS.kinds.every((k) => f.kinds.includes(k)) && ALL_NOTAMS.when.every((w) => f.when.includes(w));

/** A start as a time to sort by; none sorts last either way. */
const startOf = (n: RankedNotam): number | null => (n.starts ? Date.parse(n.starts) : null);

function sorted(notams: RankedNotam[], sort: NotamSort): RankedNotam[] {
  if (sort === "rank") return [...notams].sort((a, b) => a.rank - b.rank);
  const sign = sort === "newest" ? -1 : 1;
  return [...notams].sort((a, b) => {
    const x = startOf(a);
    const y = startOf(b);
    if (x === null || y === null) return x === y ? a.rank - b.rank : x === null ? 1 : -1;
    return (x - y) * sign || a.rank - b.rank;
  });
}

export interface ArrangedNotams {
  /** Said first: the pinned ones, then the engine's top ones not read. */
  top: RankedNotam[];
  /** Folded under "N more": the less important and the read ones. */
  rest: RankedNotam[];
  /** How many the filters leave out. */
  hidden: number;
}

/** The NOTAMs as the section shows them. */
export function arrangeNotams(notams: readonly RankedNotam[], filter: NotamFilter, sort: NotamSort, marks: NotamMarks): ArrangedNotams {
  const pinned = new Set(marks.pinned);
  const read = new Set(marks.read);
  const kept = notams.filter(
    (n) => filter.kinds.includes(kindOf(n)) && filter.when.includes(whenOf(n)) && (filter.read || !read.has(n.id) || pinned.has(n.id)),
  );
  const inOrder = sorted(kept, sort);
  const first = inOrder.filter((n) => pinned.has(n.id));
  const others = inOrder.filter((n) => !pinned.has(n.id));
  return {
    top: [...first, ...others.filter((n) => n.top && !read.has(n.id))],
    rest: others.filter((n) => !n.top || read.has(n.id)),
    hidden: notams.length - kept.length,
  };
}
