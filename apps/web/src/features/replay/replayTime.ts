import { clockSeconds, zoneName } from "../../lib/format";

/** A replay's moment (s since 1970) as a reconstruction is told: in Zulu
 *  to the second, "14:32:05Z", as ATC's tapes and the NTSB's docket time
 *  it; and on this device's clock with its zone, "08:32:05 CST". */
export function replayTimes(t: number): { zulu: string; local: string } {
  const at = new Date(t * 1000);
  return { zulu: `${clockSeconds(at, true)}Z`, local: `${clockSeconds(at)} ${zoneName(at)}` };
}
