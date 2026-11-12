import { useMemo } from "react";
import type { RunwayPicks } from "./pattern";
import { useAddressKey } from "../../../lib/address";
import { patternsOf } from "../../../lib/trafficPattern";

/** The runways the pilot picked in FPL, from the address (`pattern`,
 *  `takeoff`), where FPL keeps them: for the radio calls, the kneeboard,
 *  the mock oral and the runway check, which fly the pick (runwayFlown)
 *  and the wind's runway only where there is none. Read here rather than
 *  handed down, so every part that says a runway reads the same one. */
export function useRunwayPicks(): RunwayPicks {
  const [pattern] = useAddressKey("pattern"),
    [takeoff] = useAddressKey("takeoff");
  return useMemo(() => ({ pattern: patternsOf(pattern), takeoff: patternsOf(takeoff) }), [pattern, takeoff]);
}
