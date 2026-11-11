/**
 * The ATC copilot's two questions to the engine (engine/crates/radio's
 * atc, held to lib/fixtures/atcCalls.json): who said a transmission and
 * what it asks, and how the pilot's readback matched it. The decisions
 * are the engine's; this only names them for the feature.
 */
import { callEngine, type EngineAnswer } from "../../lib/engine/engine";

export type AtcCallAnswer = EngineAnswer<"atc_call">;
export type AtcItem = AtcCallAnswer["items"][number];
export type ReadbackAnswer = EngineAnswer<"readback_check">;

/** The call we last had, and how long ago, s: a readback with no call
 *  sign that follows it is ours (the engine's READBACK_WITHIN_S). */
interface Prior {
  text: string;
  agoS: number;
}

/** Who said `text` (to us, from us, someone else) by our call sign
 *  `tail`, and its items in the order said. */
export function atcCall(text: string, tail: string | null, prior: Prior | null): AtcCallAnswer {
  return callEngine("atc_call", { text, tail, prior: prior && { text: prior.text, ago_s: prior.agoS } });
}

/** The readback `said` against the call `cleared`: each item missed or
 *  said differently (AIM 4-4-7 b), the call sign among them with `tail`. */
export function readbackOf(cleared: string, said: string, tail: string | null): ReadbackAnswer {
  return callEngine("readback_check", { cleared, said, tail });
}
