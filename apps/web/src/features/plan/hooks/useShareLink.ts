import { useCallback } from "react";
import { done } from "../../../lib/doneNote";
import { usePreferences } from "../../../lib/preferences";
import { showError } from "../../../lib/problems";
import { cancelled, shareOrCopy } from "../../../lib/share";
import { airplaneOfChoice, sharedPlanLink } from "../../../lib/sharedFlight";
import { routeName } from "../../../lib/identSchema";
import { useAddressKey } from "../../../lib/address";

/**
 * The route's Share link (ShareMenu): the plan sent in the link itself --
 * route, altitude, departure time, airplane type and rules -- which opens
 * as a preview on the receiver's phone or browser (features/shared-flight)
 * and stores nothing anywhere. The airplane's N-number goes with it
 * whenever there is one: the owner, 2026-11-11, "keep it default and no
 * setting is needed for it" (those following the flight look it up on
 * ADS-B, as ForeFlight's shared flights carry it).
 */
export function useShareLink(planned: { dep: string; dest: string; stops: string[] }, altitudeFt: number | undefined) {
  const [depart] = useAddressKey("depart");
  const rules = usePreferences((p) => p.flightRules);
  const aircraft = usePreferences((p) => p.aircraft);
  const { type, tail } = airplaneOfChoice(aircraft);

  const share = useCallback(async () => {
    const url = sharedPlanLink(
      { ...planned, altitudeFt: altitudeFt ?? null, depart: depart || null, type, rules, tail },
      window.location.origin,
    );
    try {
      if ((await shareOrCopy({ title: routeName(planned.dep, planned.dest, planned.stops), url })) === "copied") done("Link Copied");
    } catch (err) {
      if (!cancelled(err)) showError("Could not share the route", (err as Error).message);
    }
  }, [planned, altitudeFt, depart, type, rules, tail]);

  return { share };
}
