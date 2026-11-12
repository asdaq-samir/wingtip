import { zoneName } from "../../lib/format";

const two = (n: number) => String(n).padStart(2, "0");

/** A replay's moment (s since 1970) as a reconstruction is told: in Zulu
 *  to the second, "14:32:05Z", as ATC's tapes and the NTSB's docket time
 *  it; and on this device's clock with its zone, "08:32:05 CST". */
export function replayTimes(t: number): { zulu: string; local: string } {
  const at = new Date(t * 1000);
  return {
    zulu: `${two(at.getUTCHours())}:${two(at.getUTCMinutes())}:${two(at.getUTCSeconds())}Z`,
    local: `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())} ${zoneName(at)}`,
  };
}
