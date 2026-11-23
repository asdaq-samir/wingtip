import { patternsOf } from "../lib/trafficPattern";
import { ADDRESS_HISTORY_KEYS, AIRPLANE_KEY, HISTORY_KEYS } from "./planHistoryKeys";

/**
 * Undo and redo for the route, kept from the address (PlanWorkspace keeps
 * the plan in it): the owner's rule is to make the pilot aware and never
 * stop them, so a Direct to, a route replaced, a stop removed or the
 * route cleared goes through at once, and can be taken back.
 *
 * The history is of what the address says of the plan, not of the buttons
 * that changed it: every way the route changes (the box, a card's Fly
 * Here, Direct to, a food or fuel stop, a procedure picked) writes the
 * address, so watching it catches each one, and the next way added is
 * caught too. The native app keeps the same history (ios PlanHistory).
 *
 * Every FPL edit is in it (the FPL redesign, the owner 2026-11-17): the
 * route, the altitude, the procedures and stops -- the plan's keys -- and
 * the departure time and the airplane flown, which are not the plan's
 * keys but are the pilot's edits on FPL (HISTORY_KEYS). The airplane is
 * the preferences', kept here under AIRPLANE_KEY as its JSON.
 */

/** The plan as the address has it: only the keys set. */
export type PlanState = Readonly<Record<string, string>>;

export function planStateOf(params: URLSearchParams): PlanState {
  const state: Record<string, string> = {};
  for (const key of HISTORY_KEYS) {
    const value = params.get(key);
    if (value) state[key] = value;
  }
  return state;
}

function sameState(a: PlanState, b: PlanState): boolean {
  return HISTORY_KEYS.every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

/** The address with the plan put back as it was, the page's own keys
 *  left as they are; the airplane is not the address's (its own setter). */
export function restored(params: URLSearchParams, state: PlanState): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ADDRESS_HISTORY_KEYS) {
    const value = state[key];
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

/** Changes the page makes by itself just after one of the pilot's (the
 *  ident typed made the field's own, "ORD" to KORD; the picks at a field
 *  that left the route taken out; a runway picked into the wind) are part
 *  of that change: one Undo takes the whole of it back. */
export const SETTLE_MS = 1500;
/** As many steps back as a pilot would take; the oldest go first. */
export const LIMIT = 50;

export interface PlanHistory {
  readonly past: readonly PlanState[];
  readonly now: PlanState;
  readonly future: readonly PlanState[];
  /** When the last change was taken in, for SETTLE_MS. */
  readonly at: number;
}

/** The history of a page opened on this plan: the changes the page makes
 *  to it as it loads are not the pilot's to undo. */
export const started = (now: PlanState, at: number): PlanHistory => ({ past: [], now, future: [], at });

/** The plan as the address has it now, taken in: a change of the pilot's
 *  is a step back, and one that took something away (a stop, point or
 *  procedure removed, Clear Route, the route replaced whole) says so in
 *  words (`note`, for the Undo toast); every other edit is a step with no
 *  toast, undone by Cmd-Z (the owner, 2026-11-21); one the page made as it settled is folded
 *  into the step before. */
export function observed(h: PlanHistory, next: PlanState, at: number): { history: PlanHistory; note: string | null } {
  if (sameState(h.now, next)) return { history: h, note: null };
  if (at - h.at < SETTLE_MS || byTheWind(h.now, next)) return { history: { ...h, now: next }, note: null };
  return { history: { past: [...h.past, h.now].slice(-LIMIT), now: next, future: [], at }, note: describeEdit(h.now, next) };
}

/** The keys a runway picked into the wind writes (useRunwayPicks). */
const RUNWAY_KEYS: readonly string[] = ["pattern", "takeoff", "auto"];

/** A change the page made by itself whenever the weather comes in or the
 *  wind turns, not the pilot's: only runways picked into the wind, each
 *  named in `auto` ("land:KDLH", features/plan's autoOf), as
 *  useRunwayPicks' preselect writes them. A pilot's own pick takes its
 *  runway out of `auto`, so it is never taken for one. With the route's
 *  weather slower than SETTLE_MS, the page's pick at C81 and KDLH was an
 *  Undo toast of its own on a fresh load (brief-glance.spec). */
function byTheWind(before: PlanState, after: PlanState): boolean {
  if (HISTORY_KEYS.some((key) => !RUNWAY_KEYS.includes(key) && (before[key] ?? "") !== (after[key] ?? ""))) return false;
  const wind = new Set((after.auto ?? "").split(","));
  return (["pattern", "takeoff"] as const).every((which) => {
    const was = patternsOf(before[which] ?? null),
      now = patternsOf(after[which] ?? null);
    const kind = which === "pattern" ? "land" : "takeoff";
    return [...new Set([...was.keys(), ...now.keys()])].every(
      (ident) => was.get(ident) === now.get(ident) || (now.has(ident) && wind.has(`${kind}:${ident}`)),
    );
  });
}

/** One step back: the plan to put in the address, or null with none. */
export function undone(h: PlanHistory, at: number): PlanHistory | null {
  const back = h.past.at(-1);
  if (!back) return null;
  return { past: h.past.slice(0, -1), now: back, future: [h.now, ...h.future], at };
}

/** The step taken back, again. */
export function redone(h: PlanHistory, at: number): PlanHistory | null {
  const again = h.future[0];
  if (!again) return null;
  return { past: [...h.past, h.now], now: again, future: h.future.slice(1), at };
}

const listOf = (value: string | undefined) => (value ? value.split(",").filter(Boolean) : []);

/** What a change took away, in the bar's words ("Route Cleared", "KMSN
 *  removed"); null for one that only added or changed something, which
 *  `observed` says by the part it touched ("Altitude Changed"). */
export function describeEdit(before: PlanState, after: PlanState): string | null {
  const hadRoute = !!(before.dep || before.dest);
  if (hadRoute && !after.dep && !after.dest) return "Route Cleared";
  if (after.direct && after.direct !== before.direct) return `Direct to ${after.direct}`;
  if (before.dep && before.dest && (after.dep !== before.dep || after.dest !== before.dest)) return "Route Replaced";
  const gone = listOf(before.stops).filter((stop) => !listOf(after.stops).includes(stop));
  if (gone.length === 1) return `${gone[0]} Removed`;
  if (gone.length > 1) return "Stops Removed";
  if (listOf(after.procs).length < listOf(before.procs).length) return "Procedure Removed";
  if (listOf(after.holds).length < listOf(before.holds).length) return "Hold Removed";
  return null;
}

/** What a step changed, in the one place's words ("Undo Altitude", "Redo
 *  Route"): the first part of the plan it touched, in the order a pilot
 *  plans -- the route, the altitude, the procedures, the stops' fuel and
 *  times, the departure time, the airplane. */
const PARTS: readonly (readonly [string, readonly string[]])[] = [
  ["Route", ["dep", "dest", "stops", "direct", "was"]],
  ["Altitude", ["altitude_ft", "altitude_nearest", "altitude_choice", "altitudes"]],
  ["Procedures", ["procs", "cross", "holds", "pattern", "takeoff", "auto"]],
  ["Stops", ["fuel", "ground", "alternate"]],
  ["Fuel", ["tanks"]],
  ["Departure Time", ["depart"]],
  ["Airplane", [AIRPLANE_KEY]],
];

export function editName(before: PlanState, after: PlanState): string {
  const part = PARTS.find(([, keys]) => keys.some((key) => (before[key] ?? "") !== (after[key] ?? "")));
  return part?.[0] ?? "Change";
}

/** The one place's Undo and Redo, named by what they put back; null where
 *  there is no step that way. */
export function stepNames(h: PlanHistory): { undoName: string | null; redoName: string | null } {
  const back = h.past.at(-1);
  const again = h.future[0];
  return { undoName: back ? editName(back, h.now) : null, redoName: again ? editName(h.now, again) : null };
}

/** A history kept from before a reload, taken up where the plan is still
 *  the one it ended on; else a new one. What was kept is read warily: it
 *  is the browser's, from any build. */
export function resumed(kept: unknown, now: PlanState, at: number): PlanHistory {
  const k = kept as Partial<PlanHistory> | null;
  const states = (v: unknown): v is PlanState[] => Array.isArray(v) && v.every((x) => x !== null && typeof x === "object");
  if (!k || typeof k !== "object" || !states(k.past) || !states(k.future) || !k.now || !sameState(k.now, now)) return started(now, at);
  return { past: k.past.slice(-LIMIT), now, future: k.future.slice(0, LIMIT), at };
}
