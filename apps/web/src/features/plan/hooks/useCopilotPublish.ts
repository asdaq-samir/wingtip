import { useEffect } from "react";
import type { AircraftProfile, Totals } from "../../../lib/api/types";
import { publishCopilotFlight } from "../../../lib/copilot/flight";
import { useLoad } from "./useLoad";

/**
 * The planned flight handed to the in-flight copilot (lib/copilot/flight,
 * read by features/copilot): where it goes, its line, the plan's ground
 * speed, the airplane's cruise and burn, the fuel the load starts with
 * and whether anyone but the pilot is aboard. Null with no route or no
 * nav log yet. The copilot then works from own ship alone.
 */
export function useCopilotPublish({ dest, rules, line, totals, aircraft }: {
  dest: string;
  rules: string;
  line: [number, number][] | null | undefined;
  totals: Totals | null | undefined;
  aircraft: AircraftProfile | null | undefined;
}) {
  const { loading, load } = useLoad(aircraft, totals?.fuel_gal ?? null);
  const startGal = load?.fuelGal ?? totals?.usable_fuel_gal ?? aircraft?.usable_fuel_gal ?? null;
  const fuelGal = startGal != null ? Math.max(0, startGal - (totals?.taxi_gal ?? 0)) : null;
  // A seat other than the pilot's with weight in it: the load's stations
  // by their POH names. The pilot's own station ("Pilot and front
  // passenger") is not counted, so a front-seat passenger alone is not
  // seen; the copilot then says less, never something untrue.
  const passengers = !!loading && !!load && loading.stations.some((station, i) =>
    !/pilot|baggage|cargo/i.test(station.name) && (load.stationsLb[i] ?? 0) > 0);
  const distance = totals?.distance_nm ?? null;
  const ete = totals?.ete_min ?? null;
  const plannedGsKt = distance && ete ? distance / (ete / 60) : null;
  const alternate = totals?.alternate?.ident ?? null;
  const tasKt = aircraft?.cruise_tas_kt ?? null;
  const burnGph = aircraft?.fuel_burn_gph ?? null;
  const ifr = rules.toLowerCase() === "ifr";
  useEffect(() => {
    if (!dest || !line || line.length < 2 || !totals) {
      publishCopilotFlight(null);
      return;
    }
    publishCopilotFlight({ dest, alternate, rules: ifr ? "IFR" : "VFR", line, plannedGsKt, tasKt, burnGph, fuelGal, passengers });
    return () => publishCopilotFlight(null);
  }, [dest, alternate, ifr, line, totals, plannedGsKt, tasKt, burnGph, fuelGal, passengers]);
}
