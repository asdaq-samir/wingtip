import type { PastFlightSummary } from "../../lib/api/types";
import { inAirWords, type InAir } from "../../lib/airplane/lookup";
import { ago } from "../../lib/format/time";

/**
 * The airplane card's one status line, under its tabs where the airport
 * card's weather line is (the owner's P1, 2026-11-14): in the air from the
 * live find; else where its last flight ended, from its past flights; else
 * that none was heard in adsb.lol's archive, about six weeks
 * (wingtip.traffic ARCHIVE_DAYS). `flights` is its flights newest first,
 * undefined while they are still being looked for.
 */
export function statusLine(inAir: InAir, flights: PastFlightSummary[] | undefined, now = Date.now()): { text: string; problem: boolean } {
  if (inAir.state !== "ground") return inAirWords(inAir);
  const latest = flights?.find((f) => !f.in_air);
  if (latest) {
    const since = ago(now - latest.on * 1000);
    const at = latest.destination?.ident;
    return { text: latest.landed && at ? `On the ground · landed ${at} ${since}` : `Not in the air · last heard ${since}`, problem: false };
  }
  if (flights && flights.length === 0) return { text: "Not heard in the last 6 weeks", problem: false };
  return inAirWords(inAir);
}
