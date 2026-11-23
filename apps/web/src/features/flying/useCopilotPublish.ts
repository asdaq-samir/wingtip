import { useEffect } from "react";
import type { AircraftProfile, Totals } from "../../lib/api/types";
import { publishCopilotFlight } from "../../lib/copilot/flight";
import { callEngine } from "../../lib/engine/engine";
import { useLoad } from "../plan";

/**
 * The planned flight handed to the in-flight copilot (lib/copilot/flight,
 * read by features/copilot): where it goes, its line, the plan's ground
 * speed, the airplane's cruise and burn, the fuel the load starts with
 * and whether anyone but the pilot is aboard. Null with no route or no
 * nav log yet. The copilot then works from own ship alone.
 */
export function useCopilotPublish({
  dest,
  rules,
  line,
  totals,
  aircraft,
}: {
  dest: string;
  rules: string;
  line: [number, number][] | null | undefined;
  totals: Totals | null | undefined;
  aircraft: AircraftProfile | null | undefined;
}) {
  const { loading, saved: load } = useLoad(aircraft, totals?.fuel_gal ?? null);
  const startGal = load?.fuelGal ?? totals?.usable_fuel_gal ?? aircraft?.usable_fuel_gal ?? null;
  const taxiGal = totals?.taxi_gal ?? null;
  const distanceNm = totals?.distance_nm ?? null;
  const eteMin = totals?.ete_min ?? null;
  // The load's stations by their handbook names, as one string, so the
  // flight is published again only when a weight changes.
  const stations = JSON.stringify(loading && load ? loading.stations.map((s, i) => ({ name: s.name, lb: load.stationsLb[i] ?? 0 })) : []);
  const alternate = totals?.alternate?.ident ?? null;
  const tasKt = aircraft?.cruise_tas_kt ?? null;
  const burnGph = aircraft?.fuel_burn_gph ?? null;
  const ifr = rules.toLowerCase() === "ifr";
  const planned = !!dest && !!line && line.length >= 2 && !!totals;
  useEffect(() => {
    if (!planned) {
      publishCopilotFlight(null);
      return;
    }
    // The fuel at takeoff, the plan's ground speed and whether anyone but
    // the pilot is aboard are the engine's (copilot_flight): from the
    // load's fuel (else the plan's tanks, else the airplane's), the taxi
    // allowance, the plan's miles and minutes, and the load's stations.
    const flight = callEngine("copilot_flight", {
      fuel_gal: startGal,
      taxi_gal: taxiGal,
      distance_nm: distanceNm,
      ete_min: eteMin,
      stations: JSON.parse(stations) as { name: string; lb: number }[],
    });
    publishCopilotFlight({
      dest,
      alternate,
      rules: ifr ? "IFR" : "VFR",
      line: line!,
      plannedGsKt: flight.planned_gs_kt,
      tasKt,
      burnGph,
      fuelGal: flight.fuel_gal,
      passengers: flight.passengers,
    });
    return () => publishCopilotFlight(null);
  }, [planned, dest, alternate, ifr, line, startGal, taxiGal, distanceNm, eteMin, stations, tasKt, burnGph]);
}
