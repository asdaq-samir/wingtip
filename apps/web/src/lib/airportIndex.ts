import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { flatDeg2 } from "./geo";

/** One answer: an airport, or with `fixes` a waypoint (`kind` "fix"). */
export type AirportSearchRow = Awaited<ReturnType<typeof api.airportSearch>>[number];

/** One airport of the planner's index (wingtip.airports.search_index): the
 *  ident pilots use, its name, town and state, its size rank (0 large to
 *  3 other), where it is, and the idents it is also found by. An index
 *  kept from before it said where (a day's, in the browser's cache) has
 *  the idents straight after the size. */
type Entry = [ident: string, name: string, town: string, state: string, size: number, ...rest: (number | string)[]];

export interface AirportIndex {
  rows: Entry[];
  /** Each row's latitude and longitude; NaN where the index does not say. */
  lat: Float64Array;
  lon: Float64Array;
  /** Each row's name upper-cased, for a name that starts with what is typed. */
  names: string[];
  /** Each row's idents, upper-cased: the one shown and the others. */
  keys: string[][];
  /** Each row's name and town upper-cased, a space before every word, so
   *  a word's start is a space and what is typed. */
  words: string[];
  /** Each row's label where NASR lists the field as closed ("Closed
   *  indefinitely", the engine's field_status, as the planner sends it);
   *  null where it is open. Never offered to land (decision 0043). */
  closed: (string | null)[];
  /** Each row's use where it is not a public-use field the armed services
   *  do not own (the planner's `use`, NASR APT_BASE's FACILITY_USE_CODE and
   *  OWNERSHIP_TYPE_CODE): "private", "military" or "joint"; null else. */
  use: (FieldUse | null)[];
}

/** Who may use a field, as the planner's index and search say it. */
export type FieldUse = "private" | "military" | "joint";

/** A field's use as a search row marks it, the word Nearest says it with. */
export const USE_WORDS: Record<FieldUse, string> = { private: "Private", military: "Military", joint: "Joint use" };

/**
 * The index's lookups: each row's idents and its words, upper-cased, and
 * nothing sorted -- a search reads every row (searchIndex). The planner's
 * own sorted lists (_search_index_of), copied here at first, took a third
 * of a second of a phone's main thread to sort as the page opened, its
 * longest task (measured 2026-10-09, CPU 4x); these take a tenth of that,
 * and a search through them some 8 to 13 ms (on this Mac, unthrottled).
 */
export function indexOf(rows: Entry[], closed: Record<string, string> = {}, use: Record<string, FieldUse> = {}): AirportIndex {
  const placed = (row: Entry) => typeof row[5] === "number";
  return {
    rows,
    lat: Float64Array.from(rows, (row) => (placed(row) ? (row[5] as number) : NaN)),
    lon: Float64Array.from(rows, (row) => (placed(row) ? (row[6] as number) : NaN)),
    names: rows.map(([, name]) => name.toUpperCase()),
    keys: rows.map((row) => [row[0].toUpperCase(), ...(row.slice(placed(row) ? 7 : 5) as string[])]),
    words: rows.map(([, name, town]) => ` ${name} ${town}`.toUpperCase()),
    closed: rows.map(([ident]) => closed[ident] ?? null),
    use: rows.map(([ident]) => use[ident] ?? null),
  };
}

/** How far a row is from the nearest of `near`, as an order: squared
 *  degrees, the longitude's shrunk by the latitude's cosine. */
function nearness(index: AirportIndex, row: number, near: readonly { lat: number; lon: number }[]): number {
  const lat = index.lat[row]!,
    lon = index.lon[row]!;
  if (!near.length || Number.isNaN(lat)) return 0;
  let least = Infinity;
  for (const p of near) {
    const d = flatDeg2(lat - p.lat, lon - p.lon, p.lat);
    if (d < least) least = d;
  }
  return least;
}

/** A match's order: its rank, closed after open, size, a name that starts
 *  with it, nearness, ident; then its row. */
type Ranked = [rank: number, closed: number, size: number, named: number, near: number, ident: string, row: number];

function before(a: Ranked, b: Ranked): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4] || (a[5] < b[5] ? -1 : a[5] > b[5] ? 1 : 0);
}

/** Each index's last search, what was typed and the rows that matched it. */
const lastScan = new WeakMap<AirportIndex, { query: string; rows: number[] }>();

/**
 * The airports answering what is typed, as the planner's search_airports
 * answers: the ident typed whole first, then the idents that start with
 * it, then the fields with a word of their name or town that does; the
 * bigger fields first in each, then one whose name starts with it, then
 * the nearest to `near` (the pilot, or the route), then by ident; eight at
 * most. A field NASR lists as closed after the open ones of its rank,
 * labelled (`closed`): found, never put first (decision 0043). "campbell" is C81, Campbell Airport, at Grayslake for a pilot
 * there, where eight strips named or towned Campbell elsewhere came first
 * by their idents (the owner's ask, 2026-10-22). On the phone, at once,
 * where each letter's question waited on the planner.
 */
export function searchIndex(
  index: AirportIndex,
  typed: string,
  limit = 8,
  near: readonly { lat: number; lon: number }[] = [],
): AirportSearchRow[] {
  const query = typed.trim().toUpperCase();
  if (!query) return [];
  const word = ` ${query}`;
  // A letter added to the last search can only narrow it: every row that
  // matches "KOS" matched "KO", so only the last search's matches are read
  // again, not every row. And only the best `limit` are kept as they come,
  // where every match was sorted to take eight ("K" matches thousands).
  const last = lastScan.get(index);
  const pool = last && query.startsWith(last.query) ? last.rows : null;
  const matched: number[] = [];
  const ranked: Ranked[] = [];
  const visit = (row: number) => {
    const keys = index.keys[row]!;
    const rank = keys.includes(query) ? 0 : keys.some((key) => key.startsWith(query)) ? 1 : index.words[row]!.includes(word) ? 2 : -1;
    if (rank < 0) return;
    matched.push(row);
    const entry: Ranked = [
      rank,
      index.closed[row] ? 1 : 0,
      index.rows[row]![4],
      index.names[row]!.startsWith(query) ? 0 : 1,
      nearness(index, row, near),
      index.rows[row]![0],
      row,
    ];
    if (ranked.length === limit && before(ranked[limit - 1]!, entry) <= 0) return;
    // After every one it does not come before: the order a stable sort gives.
    let at = ranked.length;
    while (at > 0 && before(entry, ranked[at - 1]!) < 0) at--;
    ranked.splice(at, 0, entry);
    if (ranked.length > limit) ranked.pop();
  };
  if (pool) for (const row of pool) visit(row);
  else for (let row = 0; row < index.rows.length; row++) visit(row);
  lastScan.set(index, { query, rows: matched });
  return ranked.slice(0, limit).map(([, , , , , , row]) => {
    const [ident, name, town, state] = index.rows[row]!;
    return {
      ident,
      name,
      municipality: town || null,
      region: state ? `US-${state}` : null,
      kind: "airport",
      closed: index.closed[row]!,
      use: index.use[row]!,
    };
  });
}

/** Once the page has nothing else to do: what is put off until then.
 *  Safari has no requestIdleCallback; two seconds stand in for it there. */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const wait = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 2000));
    const stop = window.cancelIdleCallback ?? window.clearTimeout;
    const id = wait(() => setIdle(true), { timeout: 4000 });
    return () => stop(id);
  }, []);
  return idle;
}

/** Once the pilot goes to type: a field of the page focused, the
 *  keyboard on its way up. */
function useFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (focused) return;
    const go = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) setFocused(true);
    };
    document.addEventListener("focusin", go);
    return () => document.removeEventListener("focusin", go);
  }, [focused]);
  return focused;
}

/**
 * The index, read once the pilot goes to type -- a field focused, or
 * something typed (`wanted`), and only where the caller's search is on
 * (`enabled`; a screen that never searches never downloads or reads it)
 * -- and kept a day, as the planner says it may be; none until it is in, when the planner answers as before. Its bytes
 * are downloaded before that, once the page is idle after opening
 * (api.warmAirportIndex), so the reading finds them in the browser's
 * cache. Asked for and read as the page opened (#156), it put two long
 * tasks in the opening -- reading half a megabyte of JSON and building the
 * lookups, 95 and 64 ms at CPU 4x -- for a search the pilot may not make.
 */
export function useAirportIndex(enabled = true, wanted = false): AirportIndex | null {
  const focused = useFocused();
  useWarmAirportIndex(enabled);
  const { data } = useQuery({
    queryKey: ["airportIndex"],
    queryFn: () => read(),
    enabled: enabled && (wanted || focused),
    staleTime: 24 * 60 * 60_000,
    gcTime: Infinity,
    meta: { silent: true },
  });
  return data ?? null;
}

// One download between the two: a route's figures now read the index at
// once (PlanWorkspace's estimate), as the page warms it, and the two each
// fetched the half megabyte, 2 to 5 s apiece on a busy planner (every
// route's load, 2026-10-28). Whichever comes second waits on the first and
// reads the browser's cache.
let warming: Promise<unknown> | null = null;
let reading: Promise<AirportIndex> | null = null;
// The index read ahead, once its bytes are in and the page is idle
// (warm), for the first focus to find it read: read at the focus, its
// half megabyte of JSON and its lookups were a long task while the
// keyboard came up and the first letters were typed.
let ahead: Promise<AirportIndex> | null = null;

/** The download and the read forgotten, as a page load starts without
 *  them: for the tests, which each start as a fresh page, without
 *  importing the whole module graph again (vi.resetModules), which a busy
 *  run took past the hook's ten seconds to do (2026-11-10). */
export function forgetAirportIndex() {
  warming = null;
  reading = null;
  ahead = null;
}

const fetchIndex = () => api.airportIndex().then(({ airports, closed, use }) => indexInSlices(airports as Entry[], closed, use));

async function read(): Promise<AirportIndex> {
  await warming?.catch(() => {});
  const early = ahead;
  ahead = null;
  reading = early ?? fetchIndex();
  return reading;
}

function warm(): Promise<boolean> {
  if (reading)
    return reading.then(
      () => true,
      () => true,
    );
  warming = api.warmAirportIndex();
  return warming.then(() => {
    whenIdle(() => {
      if (reading || ahead) return;
      ahead = fetchIndex();
      // Its failure is the focus's to meet (read), not an unhandled one here.
      ahead.catch(() => {});
    });
    return true;
  });
}

/** Once the page has nothing else to do; Safari has no
 *  requestIdleCallback, and two seconds stand in for it there. */
function whenIdle(go: () => void) {
  const wait = window.requestIdleCallback ?? ((then: () => void) => window.setTimeout(then, 2000));
  wait(go, { timeout: 4000 });
}

/** A turn of the page's own between two slices of work. */
const yieldToPage = () => new Promise<void>((go) => setTimeout(go, 0));

/** The index's lookups built a slice of rows at a time, the page given a
 *  turn between them: built at once, its 20,000 rows were one long task. */
const SLICE = 2500;
async function indexInSlices(rows: Entry[], closed?: Record<string, string>, use?: Record<string, FieldUse>): Promise<AirportIndex> {
  const parts: AirportIndex[] = [];
  for (let i = 0; i < rows.length; i += SLICE) {
    if (i > 0) await yieldToPage();
    parts.push(indexOf(rows.slice(i, i + SLICE), closed, use));
  }
  const lat = new Float64Array(rows.length);
  const lon = new Float64Array(rows.length);
  parts.forEach((part, k) => {
    lat.set(part.lat, k * SLICE);
    lon.set(part.lon, k * SLICE);
  });
  return {
    rows,
    lat,
    lon,
    names: parts.flatMap((p) => p.names),
    keys: parts.flatMap((p) => p.keys),
    words: parts.flatMap((p) => p.words),
    closed: parts.flatMap((p) => p.closed),
    use: parts.flatMap((p) => p.use),
  };
}

/** The index's bytes downloaded once the page is idle, by the page itself
 *  as well as by a search: the planner opens as its tabs alone, no search
 *  in sight, and the first one opened should find them there. */
export function useWarmAirportIndex(enabled = true) {
  const idle = useIdle();
  useQuery({
    queryKey: ["airportIndexWarm"],
    queryFn: warm,
    enabled: enabled && idle,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { silent: true },
  });
}

/** Each index's rows by every ident they are found by, made at the first
 *  lookup. */
const byIdent = new WeakMap<AirportIndex, Map<string, number>>();

/** Where an airport is, from the index the browser keeps (a present
 *  position, "@lat,lon", from itself); null for what the index does not
 *  place -- a waypoint, a pilot's own point. For the route's figures
 *  before the planner's (PlanWorkspace's estimate). */
export function placeOf(index: AirportIndex, ident: string): { lat: number; lon: number } | null {
  if (ident.startsWith("@")) {
    const [lat, lon] = ident.slice(1).split(",").map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : null;
  }
  const row = rowOf(index, ident);
  if (row === undefined || Number.isNaN(index.lat[row]!)) return null;
  return { lat: index.lat[row]!, lon: index.lon[row]! };
}

/** The index's row for an ident, by any it is found by. */
function rowOf(index: AirportIndex, ident: string): number | undefined {
  let rows = byIdent.get(index);
  if (!rows) {
    rows = new Map();
    for (let i = 0; i < index.keys.length; i++) for (const key of index.keys[i]!) if (!rows.has(key)) rows.set(key, i);
    byIdent.set(index, rows);
  }
  return rows.get(ident.toUpperCase());
}

/** The label of a field NASR lists as closed (the engine's field_status,
 *  as the planner sends it, decision 0043), null where it is open or the
 *  index does not know it (a waypoint, a position) or is not read yet. */
export function closedOf(index: AirportIndex | null | undefined, ident: string): string | null {
  if (!index) return null;
  const row = rowOf(index, ident);
  return row === undefined ? null : index.closed[row]!;
}
