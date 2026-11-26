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

type Level = {
  fit: "short" | "crosswind" | "tailwind" | "close";
  holds: (f: EndFit, tailKt: number) => boolean;
  ring: string;
  note: (f: EndFit, tailKt: number) => string;
};

const CAUTION = "ring-2 ring-caution";

/** How a runway end can fit badly, worst first: the first that holds is
 *  the one its ring (red too short, amber otherwise) and its menu row's
 *  note say. A tailwind is a caution (AIM 4-3-6: land and take off into
 *  the wind where it can be; the engine's runway_end_fit), as a crosswind
 *  past the demonstrated is. */
const LEVELS: readonly Level[] = [
  { fit: "short", holds: (f) => f.short, ring: "ring-2 ring-destructive", note: () => "Too short today" },
  { fit: "crosswind", holds: (f) => f.crosswindOver, ring: CAUTION, note: (f) => `Crosswind ${f.crosswindKt} kt` },
  { fit: "tailwind", holds: (_, tailKt) => tailKt > 0, ring: CAUTION, note: (_, tailKt) => `Tailwind ${tailKt} kt` },
  { fit: "close", holds: (f) => f.close, ring: CAUTION, note: () => "Little to spare" },
];

/** One runway end as a choice: its number, the wind's mark on the end the
 *  wind favours (`into`), and its fit today (runwayFit, LEVELS) as a ring,
 *  the chip not grown, said in its words to a reader. */
export function endChoice(runway: Runway, end: RunwayEnd, into: string | null, fitOf: (runway: Runway, end: RunwayEnd) => EndFit | null) {
  const id = runwayNumber(end.ident);
  const fitted = fitOf(runway, end);
  const tail = fitted && fitted.tailwindKt > 0 ? fitted.tailwindKt : 0;
  const level = fitted ? LEVELS.find((l) => l.holds(fitted, tail)) : undefined;
  // Never "into the wind" with the wind behind it: the pick's best end
  // where only one end has a heading can have it (the aviation audit,
  // 2026-11-25).
  const windward = into === id && !tail;
  const said = fitted?.short ? ", too short today" : fitted?.close ? ", little to spare in length" : "";
  // The crosswind said as a figure, grey, where nothing else is said of
  // the end and there is one: an airplane with no demonstrated crosswind
  // to judge it by still hears of 25 knots across (the owner, 2026-11-26).
  const across = fitted && !fitted.crosswindOver && fitted.crosswindKt > 0 ? fitted.crosswindKt : 0;
  // Everything that holds, after its number: what the pill's name and a
  // menu row's say past "Runway 14".
  const detail = `${windward ? ", into the wind" : ""}${tail ? `, tailwind ${tail} knots` : ""}${fitted?.crosswindOver ? `, crosswind ${fitted.crosswindKt} knots, past the airplane's demonstrated` : across ? `, crosswind ${across} knots` : ""}${said}`;
  const words = `Runway ${id}${detail}`;
  const calm = windward ? (across ? `Into the wind · Crosswind ${across} kt` : "Into the wind") : across ? `Crosswind ${across} kt` : null;
  // How it fits in a few words, for a menu's row: the chip's ring has no
  // room for them.
  const note = level && fitted ? level.note(fitted, tail) : calm;
  const ring = level?.ring;
  const fit = level?.fit;
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
