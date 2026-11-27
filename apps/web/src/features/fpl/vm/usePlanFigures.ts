import { useMemo } from "react";
import type { AircraftChoice, AircraftProfileSummary } from "../../../lib/api/types";
import { cruiseTasOf, taxiFuelOf } from "../../../lib/aircraftChoice";

/**
 * The airplane's book figures the screen gives before the nav log's
 * (usePlanBrief's `estimate`): an ask of the engine (airplane_figures with
 * the airplane's whole profile), worked out again only when the airplane
 * changes. Written inline in usePlanBrief, which the compiler leaves
 * alone, it was asked at every render of the planner's view model -- each
 * nav log batch, each turn of the sheet, each card opened. (Whether the
 * winds are out of date went with More's stale dot, e401f646d; its minute
 * clock with it, which drew the whole planner again each minute.)
 */
export function usePlanFigures({
  aircraft,
  profiles,
  engine,
}: {
  aircraft: AircraftChoice;
  profiles: AircraftProfileSummary[] | undefined;
  /** The engine is loaded (usePlanRoute's `engine`). */
  engine: boolean;
}) {
  return useMemo(() => {
    const profile = profiles?.find((p) => p.name === aircraft.profile);
    return {
      cruiseTasKt: cruiseTasOf(aircraft, profiles),
      fuelBurnGph: aircraft.fuelBurnGph ?? profile?.fuel_burn_gph ?? null,
      taxiFuelGal: engine ? taxiFuelOf(aircraft, profiles) : null,
    };
  }, [aircraft, profiles, engine]);
}
