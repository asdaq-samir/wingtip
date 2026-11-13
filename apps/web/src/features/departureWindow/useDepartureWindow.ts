import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { localDay } from "../../lib/format";
import { api } from "../../lib/api/client";
import type { DepartureWindowAsk, WindowHour } from "../../lib/api/types";
import { routeKeyOf, useBriefPlan } from "../../lib/briefPlan";
import { currencyInput } from "../../lib/frat";
import { airplaneChosen, usePreferences } from "../../lib/preferences";
import { currencyQuery, pilotQuery } from "../../lib/queryClient";

/** The hours are asked once for a route, its airplane and the pilot's
 *  minimums, and kept for ten minutes: the forecasts they read change
 *  hourly at most, and each ask is a briefing for every hour. */
const KEPT_MS = 10 * 60_000;

/**
 * "When should I go?"'s view model: the planner's answer for the route on
 * the Brief (useBriefPlan) with the airplane picked, the flight rules and
 * the pilot's minimums and currency (POST /api/departure-window, the
 * engine's departure_window over the Go / No-Go's own findings), and the
 * hour the pilot tapped. No airplane picked: asked without one, and the
 * hours judge the weather, the airspace and the daylight alone.
 */
export function useDepartureWindow() {
  const plan = useBriefPlan();
  const aircraft = usePreferences((p) => p.aircraft);
  const rules = usePreferences((p) => p.flightRules);
  const minimums = usePreferences((p) => p.minimums);
  const airplane = airplaneChosen(aircraft);
  const { data: pilot } = useQuery(pilotQuery);
  const { data: currency } = useQuery({ ...currencyQuery, enabled: !!pilot });
  const ask: DepartureWindowAsk = {
    dep: plan.dep,
    dest: plan.dest,
    stops: plan.stops.join(","),
    // None asked with no airplane picked: the planner then assumes none.
    aircraft: airplane ? aircraft.profile : null,
    cruise_tas_kt: aircraft.cruiseTasKt ?? null,
    fuel_burn_gph: aircraft.fuelBurnGph ?? null,
    usable_fuel_gal: aircraft.usableFuelGal ?? null,
    climb_tas_kt: aircraft.climbTasKt ?? null,
    climb_fuel_burn_gph: aircraft.climbFuelBurnGph ?? null,
    descent_ias_kt: aircraft.descentIasKt ?? null,
    descent_fuel_burn_gph: aircraft.descentFuelBurnGph ?? null,
    cruise_power_pct: aircraft.cruisePowerPct ?? null,
    service_ceiling_ft: aircraft.serviceCeilingFt ?? null,
    rules,
    airplane,
    // The route as planned, the planner's defaults for the rest: the
    // altitude plan it picks, checkpoints, no own altitudes, procedures,
    // holds or ground time; each hour a departure of its own.
    alternate: "",
    altitude_choice: "fastest",
    altitude_nearest: false,
    altitudes: "",
    altitude_starts: "",
    checkpoints: true,
    class_b_clearance: false,
    crossings: "",
    ground: "",
    holds: "",
    procedures: "",
    runways: "",
    ticked: [],
    hours: 48,
    // The pilot's own day, which the logbook's dates are read on.
    day: localDay(),
    minimums: {
      ceiling_ft: minimums.ceilingFt,
      visibility_sm: minimums.visibilitySm,
      crosswind_kt: minimums.crosswindKt,
      wind_kt: minimums.windKt,
    },
    currency: currency ? currencyInput(currency) : null,
  };
  const query = useQuery({
    queryKey: ["departure-window", routeKeyOf({ ...plan, depart: "" }), JSON.stringify(ask)],
    queryFn: ({ signal }) => api.departureWindow(ask, signal),
    // Signed in: the planner's heaviest ask, kept to pilots with an
    // account (the gateway's x-gateway mark). A local flight has no route
    // to judge along.
    enabled: plan.routed && !plan.local && !!plan.dep && !!plan.dest && !!pilot,
    staleTime: KEPT_MS,
    meta: { silent: true },
  });
  const [picked, setPicked] = useState<string | null>(null);
  const hours = query.data?.hours ?? [];
  const best = query.data?.windows[0] ?? null;
  const selected: WindowHour | null = hours.find((h) => h.depart === picked) ?? null;
  return {
    shown: plan.routed && !plan.local,
    signedIn: !!pilot,
    pending: query.isPending && query.fetchStatus !== "idle",
    error: query.error,
    hours,
    best,
    airplane,
    forecastUntil: query.data?.forecast_until ?? null,
    selected,
    /** The hour picked, or none (the strip's ToggleGroup lets it go). */
    pick: (depart: string | null) => setPicked(depart),
  };
}
