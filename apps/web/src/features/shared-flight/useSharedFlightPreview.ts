import { useQuery } from "@tanstack/react-query";
import { loadAddress, useAddress } from "../../lib/address";
import { ApiError } from "../../lib/api/client";
import { sharedFlights } from "../../lib/api/sharedFlights";
import type { SharedFlight } from "../../lib/api/types";
import { planHrefOf } from "../../lib/flightLink";
import { wantScreen } from "../../lib/navigation/wanted";
import { usePreferences } from "../../lib/preferences";
import { paramsForSharedPlan, type SharedLink, type SharedPlan } from "../../lib/sharedFlight";
import { closeSharedLink } from "./store";

/** A saved flight's share read as the preview shows a plan. */
function planOfShared(f: SharedFlight): SharedPlan {
  return {
    dep: f.departureIdent,
    dest: f.destinationIdent,
    stops: f.stops,
    altitudeFt: f.cruiseAltitudeFt ?? null,
    depart: f.plannedFor ?? null,
    type: f.aircraftType ?? null,
    // A saved flight keeps no rules of its own: the receiver's stay.
    rules: null,
    tail: f.aircraftTailNumber ?? null,
  };
}

/**
 * The shared flight's preview, its one hook (MVVM): the plan a link
 * carries, or the saved flight its token names (GET
 * /api/shared-flights/{token}, read signed out as in), and the two
 * answers. Use This Plan makes it the planner's plan -- its route,
 * altitude, departure time still ahead, rules, and a saved flight's own
 * altitudes and picks -- and opens its nav log; Not Now leaves the
 * receiver's plan as it was. Nothing changes before one is chosen.
 */
export function useSharedFlightPreview(link: SharedLink) {
  const [, setAddress] = useAddress();
  const setFlightRules = usePreferences((p) => p.setFlightRules);
  // The receiver's own airplane, which the plan is flown with: the type
  // sent is shown, never picked for them (no assumed airplane).
  const ownAirplane = usePreferences((p) => (p.aircraft.none ? null : p.aircraft.label));
  const token = link.kind === "saved" ? link.token : null;
  const asked = useQuery({
    queryKey: ["shared-flight", token],
    queryFn: () => sharedFlights.get(token!),
    enabled: token !== null,
    // A link no longer shared is an answer, said in the sheet, not an alert.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
    meta: { silent: true },
  });
  const saved = asked.data ?? null;
  const plan = link.kind === "plan" ? link.plan : saved ? planOfShared(saved) : null;
  const gone = asked.error instanceof ApiError && asked.error.status === 404;

  const use = () => {
    if (!plan) return;
    const params = saved ? new URLSearchParams(planHrefOf(saved).split("?")[1]) : paramsForSharedPlan(plan);
    if (plan.rules) setFlightRules(plan.rules);
    // The address this plan alone, a new entry, so Back and Undo give the
    // receiver's plan back.
    void setAddress(loadAddress(params), { history: "push" });
    wantScreen("navlog");
    closeSharedLink();
  };

  return {
    plan,
    /** The filed nav log, a saved flight's alone (a plain link's is
     *  worked out once the plan is used, on the receiver's winds). */
    navLog: saved?.checkpoints ?? null,
    totals: saved ? { nm: saved.totalDistanceNm, minutes: saved.totalEteMin, gal: saved.totalFuelGal } : null,
    asked: token !== null ? asked : null,
    gone,
    ownAirplane,
    use,
    notNow: closeSharedLink,
  };
}

export type SharedFlightPreview = ReturnType<typeof useSharedFlightPreview>;
