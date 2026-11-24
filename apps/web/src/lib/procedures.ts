import type { ProcedureFix, ProcedureList } from "./api/types";
import { callEngine } from "./engine/engine";
import { altFt } from "./format";
// The one same-field test, kept beside the idents (identSchema).
export { sameField } from "./identSchema";

/** An instrument procedure picked at a field of the route (the route's
 *  Procedures): the field, the procedure's coded identifier ("I08-Y"),
 *  and its transition -- none for an approach from vectors, or an
 *  arrival's or departure's common route alone. */
export interface PickedProcedure {
  ident: string;
  id: string;
  transition: string | null;
  /** A fix of it ATC sent the airplane direct to, at the owner's ask ("the
   *  ability to go direct to a fix as told by ATC"): the procedure flown
   *  from there (wingtip.procedure_paths). */
  direct?: string | null;
  /** An approach loaded and not activated, as a GPS navigator loads one
   *  (the owner, 2026-11-22): shown as its own box, not in the route the
   *  planner and the nav log fly until the pilot activates it. */
  loaded?: boolean;
  /** Activated, its missed approach unsuspended: flown on from the missed
   *  approach point to its hold (AIM 5-4-21), not suspended there. */
  missed?: boolean;
}

/** A procedure's fix as its branch in FPL's list (FixBranch) and its card
 *  (FixCard) show it: the drawing's, and whether the chart puts a
 *  procedure turn at it. */
export type BranchFix = Pick<ProcedureFix, "ident" | "roles" | "min_ft" | "max_ft"> & { turn?: boolean };

/** The parts a fix plays, as a chart names them, its hold left to the line. */
export const fixRoles = (fix: BranchFix) => [...fix.roles.filter((r) => r !== "hold"), ...(fix.turn ? ["↺ procedure turn"] : [])];

/** A transition as a pilot picks it, said one way everywhere (the
 *  menus, the procedure's page, the route's box): an approach's from its
 *  initial fix or from vectors to final; an arrival's from where it
 *  starts, or its common route alone; a departure's to where it ends. */
export function transitionWords(kind: "approach" | "arrival" | "departure", transition: string | null, inLine = false): string {
  const words =
    transition === null
      ? kind === "approach"
        ? "Vectors to final"
        : "Common route"
      : kind === "departure"
        ? `To ${transition}`
        : `From ${transition}`;
  // In the middle of a line, its first word's capital dropped, the fix's kept.
  return inLine ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

/** A procedure's name as the route shows it: a circling-only approach's
 *  letter set apart from its kind, "RNAV (GPS) -B", "VOR -A", where the
 *  FAA's list runs them together (the owner, 2026-11-24: "you need a space
 *  before -B"). */
export function procedureTitle(name: string): string {
  return name.replace(/(\S)-([A-Z])$/, "$1 -$2");
}

/** The runway an approach lands on, as a pattern's chip names it: "ILS
 *  RWY 09L" is "9L"; a circling-only approach ("VOR-A", "RNAV (GPS)-B")
 *  has none. */
export function approachRunway(name: string): string | null {
  const m = /\bRWY\s*0*(\d{1,2}[LCR]?)\b/i.exec(name);
  return m ? m[1]!.toUpperCase() : null;
}

/** The procedures picked, from the address: "KBUR:I08-Y:LAX,KBUR:JANNY5",
 *  each a field, a procedure and its transition, after a fourth colon a
 *  fix flown direct to ("KELD:I22::BXCMB"), and after a fifth "L" an
 *  approach loaded or "M" its missed approach flown ("KDLH:I27:::L"), as
 *  the patterns are kept ("pattern=KDLH:27"). What is not one is left out. */
export function proceduresOf(param: string | null): PickedProcedure[] {
  if (!param) return [];
  // The shared engine's reading (crate::route::picks), the one the
  // planner's PlanQuery.procedure_picks asks too: the planner refuses a
  // piece that is not exactly one, the address leaves it out.
  const read = callEngine("procedures_read", { text: param });
  return read.flatMap(({ pick }) => {
    if (!pick) return [];
    const { direct, loaded, missed, ...picked } = pick;
    return [{ ...picked, ...(direct ? { direct } : {}), ...(loaded ? { loaded } : {}), ...(missed ? { missed } : {}) }];
  });
}

/** A procedure typed among a route's points, with the points either side
 *  of it as typed: a departure's transition is the fix after it, an
 *  arrival's the fix before it. */
export interface TypedProcedure {
  name: string;
  before: string | null;
  after: string | null;
}

/** A typed procedure as picked, found where it can be flown: a departure
 *  out of the route's departure, by the fix after it where that is one of
 *  its transitions; else an arrival into the destination, joined at the
 *  fix before it. With the kind, so the field's pick of that kind it
 *  replaces can be found; null where neither field publishes it. */
export async function typedProcedure(
  typed: TypedProcedure,
  route: { dep: string; dest: string },
  list: (ident: string) => Promise<ProcedureList>,
): Promise<{ picked: PickedProcedure; kind: "departure" | "arrival"; list: ProcedureList } | null> {
  const ends = [
    [route.dep, "departure", typed.after],
    [route.dest, "arrival", typed.before],
  ] as const;
  for (const [field, kind, join] of ends) {
    if (!field) continue;
    const found = await list(field).catch(() => null);
    const procedure = found?.procedures.find((p) => p.kind === kind && p.id === typed.name);
    if (found && procedure) {
      const transition = join && procedure.transitions.includes(join) ? join : null;
      return { picked: { ident: field, id: procedure.id, transition }, kind, list: found };
    }
  }
  return null;
}

/** The picks the route flies: an approach only loaded left out (the
 *  planner leaves it out as well, PlanQuery.procedure_picks). */
export const flownPicks = (picks: PickedProcedure[]) => picks.filter((p) => !p.loaded);

/** The procedures picked, for the address. */
export function proceduresParam(picks: PickedProcedure[]): string {
  // None picked writes nothing: the engine not asked (the page's first
  // draw, before it is there).
  if (!picks.length) return "";
  return callEngine("procedures_write", { picks });
}

/** One line of a fix's altitudes as an approach chart sets it (the FAA's
 *  Aeronautical Chart User's Guide, terminal procedures): a minimum
 *  altitude underlined, a maximum one overlined, a mandatory one both. */
interface AltitudeLine {
  text: string;
  under: boolean;
  over: boolean;
}

/** A fix's crossing altitudes as the chart writes them: one line at or
 *  above, at or below, or at; between two, the higher over the lower --
 *  and in words, for a screen reader. */
export function altitudeLines(fix: Pick<ProcedureFix, "min_ft" | "max_ft">): { lines: AltitudeLine[]; words: string | null } {
  // Which lines and how each is set are the engine's (crate::route::picks);
  // the figures' print and the words are the page's.
  const set = callEngine("altitude_lines", { min_ft: fix.min_ft ?? null, max_ft: fix.max_ft ?? null });
  const lines = set.lines.map(({ ft, under, over }) => ({ text: altFt(ft), under, over }));
  const { min_ft: low, max_ft: high } = fix;
  const words = {
    at: () => `at ${altFt(low!)} ft`,
    between: () => `between ${altFt(low!)} and ${altFt(high!)} ft`,
    at_or_above: () => `at or above ${altFt(low!)} ft`,
    at_or_below: () => `at or below ${altFt(high!)} ft`,
  };
  return { lines, words: set.crossing ? words[set.crossing]() : null };
}

/** A crossing altitude's line as CSS's text-decoration: underlined for at
 *  or above, overlined for at or below, both for at. */
export const decorationOf = (line: AltitudeLine) =>
  [line.under && "underline", line.over && "overline"].filter(Boolean).join(" ") || "none";

/** A fix's speed as the chart words it (ARINC 424-18 5.261): "at" the
 *  speed, or "min" or "max" of it. */
export function speedWords(fix: Pick<ProcedureFix, "speed_kt" | "speed_limit">): string | null {
  if (!fix.speed_kt) return null;
  if (fix.speed_limit === "min") return `${fix.speed_kt} kt min`;
  if (fix.speed_limit === "max") return `${fix.speed_kt} kt max`;
  return `${fix.speed_kt} kt`;
}
