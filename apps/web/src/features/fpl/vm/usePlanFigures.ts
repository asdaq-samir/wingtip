import { useMemo } from "react";
import type { AircraftChoice, AircraftProfileSummary, Totals } from "../../../lib/api/types";
import { cruiseTasOf, taxiFuelOf } from "../../../lib/aircraftChoice";
import { windsOutOfDate } from "../../plan";

/**
 * The airplane's book figures the screen gives before the nav log's
 * (usePlanBrief's `estimate`), and whether the nav log's winds are out of
 * date: each an ask of the engine (airplane_figures with the airplane's
 * whole profile, weather_in_force), worked out again only when what it is
 * of changes. Written inline in usePlanBrief, which the compiler leaves
 * alone, both were asked at every render of the planner's view model --
 * each nav log batch, each turn of the sheet, each card opened.
 */
export function usePlanFigures({
  aircraft,
  profiles,
  engine,
  totals,
  minute,
  depart,
}: {
  aircraft: AircraftChoice;
  profiles: AircraftProfileSummary[] | undefined;
  /** The engine is loaded (usePlanRoute's `engine`). */
  engine: boolean;
  totals: Totals | null;
  /** The minute clock (useMinuteClock). */
  minute: number;
  depart: string;
}) {
  const airplane = useMemo(() => {
    const profile = profiles?.find((p) => p.name === aircraft.profile);
    return {
      cruiseTasKt: cruiseTasOf(aircraft, profiles),
      fuelBurnGph: aircraft.fuelBurnGph ?? profile?.fuel_burn_gph ?? null,
      taxiFuelGal: engine ? taxiFuelOf(aircraft, profiles) : null,
    };
  }, [aircraft, profiles, engine]);
  const windsStale = useMemo(() => windsOutOfDate(totals, minute, depart), [totals, minute, depart]);
  return { ...airplane, windsStale };
}
