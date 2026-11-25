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

/** One runway end as a choice: its number, the wind's mark on the end the
 *  wind favours (`into`), and its fit today (runwayFit) -- too short in
 *  red, a crosswind past the demonstrated or a length inside the margin in
 *  amber, a ring, the chip not grown -- said in its words to a reader. */
export function endChoice(runway: Runway, end: RunwayEnd, into: string | null, fitOf: (runway: Runway, end: RunwayEnd) => EndFit | null) {
  const id = runwayNumber(end.ident);
  const windward = into === id;
  const fitted = fitOf(runway, end);
  const ring = fitted?.short
    ? "ring-2 ring-destructive"
    : fitted && (fitted.crosswindOver || fitted.close)
      ? "ring-2 ring-caution"
      : undefined;
  const said = fitted?.short ? ", too short today" : fitted?.close ? ", little to spare in length" : "";
  const words = `Runway ${id}${windward ? ", into the wind" : ""}${fitted?.crosswindOver ? `, crosswind ${fitted.crosswindKt} knots, past the airplane's demonstrated` : ""}${said}`;
  const fit = fitted?.short ? "short" : fitted?.crosswindOver ? "crosswind" : fitted?.close ? "close" : undefined;
  // How it fits in a few words, for a menu's row: the chip's ring has no
  // room for them.
  const note = fitted?.short
    ? "Too short today"
    : fitted?.crosswindOver
      ? `Crosswind ${fitted.crosswindKt} kt`
      : fitted?.close
        ? "Little to spare"
        : windward
          ? "Into the wind"
          : null;
  return {
    id,
    ring,
    words,
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
