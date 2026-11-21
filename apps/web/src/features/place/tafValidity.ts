import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import { zuluTime } from "../../lib/format";

/**
 * A field's TAF's own times, and whether it speaks for now: the engine's
 * `taf_validity` (FAA-H-8083-28B 27.4.1: a TAF is a forecast for its valid
 * period), so a TAF the card kept from before the signal was lost is never
 * read as today's forecast. Only the words are here; the rule is the
 * engine's. Warn, never limit: the card still shows what it has.
 */
export type TafValidity = NonNullable<EngineAnswer<"taf_validity">>;

/** The engine's reading of a TAF as sent at `nowMs`; null for none, or
 *  words that are not a TAF. */
export function tafValidity(taf: string | null | undefined, nowMs: number): TafValidity | null {
  if (!taf) return null;
  try {
    return callEngine("taf_validity", { taf, now: Math.floor(nowMs / 1000) });
  } catch {
    // The engine not in yet: said once it is.
    return null;
  }
}

/** A TAF time as its header writes one, the UTC day and the time: "12
 *  1200Z". */
const dayZulu = (s: number) => {
  const at = new Date(s * 1000);
  return `${at.getUTCDate()} ${zuluTime(at)}`;
};

/** The TAF's line under the card's hours: when it was issued and to when
 *  it is valid, or that it has run out (in the caution colour) or is not
 *  yet in force. */
export function tafLine(v: TafValidity): { line: string; caution: boolean } {
  if (v.state === "expired") return { line: `TAF expired ${dayZulu(v.valid_to)}: no forecast in force`, caution: true };
  if (v.state === "not_yet") return { line: `TAF issued ${dayZulu(v.issued)}, valid from ${dayZulu(v.valid_from)}`, caution: false };
  return { line: `TAF issued ${dayZulu(v.issued)}, valid to ${dayZulu(v.valid_to)}`, caution: false };
}
