import { Wind } from "lucide-react";
import type { Runway } from "../../lib/api/types";
import { runwayNumber, type ProcedureAirport, type RunwayEnd } from "../plan";
import type { EndFit } from "./runwayFit";

/** A field's runway ends that can be picked, open and surveyed, in order:
 *  the runway chips' (PatternChips) and the runway pill's (RunwayPill). */
export function runwayEnds(a: ProcedureAirport) {
  return (a.runways ?? [])
    .filter((r) => !r.closed)
    .flatMap((r) => (r.runway_ends ?? []).filter((e) => e.heading_true_deg != null).map((e) => ({ runway: r, end: e })))
    .sort((x, y) => x.end.ident.localeCompare(y.end.ident));
}

type Fit = NonNullable<EndFit["fit"]>;

/** Each way an end can fit badly, as the engine names it (runway::fit,
 *  which decides which holds, worst first, for FPL and the Brief alike):
 *  how a menu row says it. Its ring is red for a stop, amber for a
 *  caution. */
const NOTES: Record<Fit, (f: EndFit) => string> = {
  short: () => "Too short today",
  crosswind: (f) => `Crosswind ${f.crosswind_kt} kt`,
  tailwind: (f) => `Tailwind ${f.tailwind_kt} kt`,
  close: () => "Little to spare",
  beyond: () => "Past the POH's tables",
  // No temperature reported: the distances are a standard day's, and a
  // hot day's are longer (FAA-H-8083-25C, chapter 11).
  standard_day: () => "Assumes a standard day",
};

/** One runway end as a choice: its number, the wind's mark on the end the
 *  wind favours (`into`), and its fit today (the engine's runway::fit, NOTES) as a ring,
 *  the chip not grown, said in its words to a reader. */
export function endChoice(runway: Runway, end: RunwayEnd, into: string | null, fitOf: (runway: Runway, end: RunwayEnd) => EndFit | null) {
  const id = runwayNumber(end.ident);
  const fitted = fitOf(runway, end);
  const tail = fitted && fitted.tailwind_kt > 0 ? fitted.tailwind_kt : 0;
  const level = fitted?.fit ?? undefined;
  // Never "into the wind" with the wind behind it: the pick's best end
  // where only one end has a heading can have it.
  const windward = into === id && !tail;
  const said = fitted?.short
    ? ", too short today"
    : fitted?.close
      ? ", little to spare in length"
      : fitted?.beyond
        ? ", past the POH's tables"
        : fitted?.temp_assumed
          ? ", distances assume a standard day, no temperature reported"
          : "";
  // The crosswind said as a figure, grey, where nothing else is said of
  // the end and there is one: an airplane with no demonstrated crosswind
  // to judge it by still hears of 25 knots across (the owner, 2026-11-26).
  const across = fitted && !fitted.crosswind_over && fitted.crosswind_kt > 0 ? fitted.crosswind_kt : 0;
  // Everything that holds, after its number: what the pill's name and a
  // menu row's say past "Runway 14".
  const detail = `${windward ? ", into the wind" : ""}${tail ? `, tailwind ${tail} knots` : ""}${fitted?.crosswind_over ? `, crosswind ${fitted.crosswind_kt} knots, past the airplane's demonstrated` : across ? `, crosswind ${across} knots` : ""}${said}`;
  const words = `Runway ${id}${detail}`;
  const calm = windward ? (across ? `Into the wind · Crosswind ${across} kt` : "Into the wind") : across ? `Crosswind ${across} kt` : null;
  // How it fits in a few words, for a menu's row: the chip's ring has no
  // room for them.
  const note = level && fitted ? NOTES[level](fitted) : calm;
  const ring = fitted?.finding === "stop" ? "ring-2 ring-destructive" : fitted?.finding === "caution" ? "ring-2 ring-caution" : undefined;
  const fit = level;
  return {
    id,
    ring,
    words,
    detail,
    fit,
    note,
    face: (
      <>
        {windward && <Wind className="size-4" strokeWidth={2.2} aria-hidden />}
        {id}
      </>
    ),
  };
}
