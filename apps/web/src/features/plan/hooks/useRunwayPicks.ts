import { useCallback, useMemo, useState } from "react";
import type { Address, SetAddress } from "../../../lib/address";
import { patternsOf, patternsParam } from "../../../lib/trafficPattern";
import { NO_AUTO, autoOf } from "./planAddress";

/**
 * The runways picked at the route's fields (usePlanWorkspace), kept in the
 * address as the rest of the plan is: the traffic patterns landed by
 * ("KDLH:27,C81:24", `pattern`), the runways left from (`takeoff`), and
 * which of them were picked into the wind (`auto`).
 */
export function useRunwayPicks({ address, setAddress }: { address: Address; setAddress: SetAddress }) {
  // The traffic patterns the pilot picked for the route's fields (the
  // route's Procedures), kept in the address as the rest of the plan is:
  // "KDLH:27,C81:24".
  const patternParam = address.pattern;
  const pickedPatterns = useMemo(() => patternsOf(patternParam), [patternParam]);
  // The pattern just picked, for the map to go to it.
  const [patternFocus, setPatternFocus] = useState<string | null>(null);
  // A runway picked at a field, to land on (`pattern`) or to leave from
  // (`takeoff`): by the pilot, or for them into the wind (ProceduresRoute).
  // One picked into the wind is named in `auto` ("land:KABQ,takeoff:KEVU")
  // and follows the wind as it changes, until the pilot picks there: KABQ's
  // runway 3, picked on an earlier northerly, stood against the 180° 7 kt
  // the field then reported (the owner's screenshot, 2026-10-21).
  // An address from before `auto` (2026-10-21) has every runway in it
  // taken as picked into the wind, and picked again for the wind now, at
  // the owner's word ("repick runways for best winds"): it could not say
  // which were the pilot's. One with none picked for the wind says so
  // (NO_AUTO), so the pilot's own are kept.
  const autoParam = address.auto;
  const takeoffNow = address.takeoff;
  const autoPicked = useMemo(() => autoOf(autoParam, patternParam, takeoffNow), [autoParam, patternParam, takeoffNow]);
  const pickRunway = useCallback(
    (which: "pattern" | "takeoff", ident: string, end: string | null, byWind: boolean) => {
      void setAddress((prev) => {
        const picked = patternsOf(prev[which]);
        const auto = autoOf(prev.auto, prev.pattern, prev.takeoff);
        const key = `${which === "pattern" ? "land" : "takeoff"}:${ident}`;
        // A pick into the wind worked out before the pilot's own landed is
        // dropped: the pilot's stands. KMSN's takeoff runway 36, picked as the
        // wind came in, was turned to 18 a moment later and marked as the
        // wind's (stops.spec, 2 runs of 7 on desktop, 2026-10-28).
        if (byWind && picked.has(ident) && !auto.has(key)) return {};
        if (end) picked.set(ident, end);
        else picked.delete(ident);
        if (byWind && end) auto.add(key);
        else auto.delete(key);
        return { [which]: picked.size ? patternsParam(picked) : null, auto: auto.size ? [...auto].join(",") : NO_AUTO };
      });
    },
    [setAddress],
  );
  const setPattern = useCallback((ident: string, end: string | null) => pickRunway("pattern", ident, end, false), [pickRunway]);
  const preselectPattern = useCallback((ident: string, end: string) => pickRunway("pattern", ident, end, true), [pickRunway]);
  // Picked by the pilot, the map goes to it; picked for them into the wind
  // as the route comes in (ProceduresRoute), the map stays on the route.
  const pickPattern = useCallback(
    (ident: string, end: string | null) => {
      if (end) setPatternFocus(`${ident}:${end}:${Date.now()}`);
      setPattern(ident, end);
    },
    [setPattern],
  );
  // The runway a stop is left from, which may not be the one landed on,
  // at the owner's ask ("arrival first with a runway and a separate
  // departure with a runway"): "KMSN:36", as the patterns are written.
  // The pattern drawn at a stop stays the landing's.
  const pickedTakeoffs = useMemo(() => patternsOf(takeoffNow), [takeoffNow]);
  const setTakeoff = useCallback((ident: string, end: string | null) => pickRunway("takeoff", ident, end, false), [pickRunway]);
  const preselectTakeoff = useCallback((ident: string, end: string) => pickRunway("takeoff", ident, end, true), [pickRunway]);
  return { pickedPatterns, patternFocus, autoPicked, pickPattern, preselectPattern, pickedTakeoffs, setTakeoff, preselectTakeoff };
}
