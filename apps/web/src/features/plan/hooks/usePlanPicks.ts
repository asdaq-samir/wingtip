import { useRunwayPicks } from "./useRunwayPicks";
import { useRouteTidy } from "./useRouteTidy";
import { useFieldPatterns } from "./useFieldPatterns";
import { useProcedurePicks } from "./useProcedurePicks";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";

/**
 * What is picked at the route's fields (usePlanWorkspace): the runways
 * (useRunwayPicks), the fields themselves with their runways' fit and
 * patterns (useFieldPatterns), and the instrument procedures
 * (useProcedurePicks); picks at fields the route no longer has let go
 * (useRouteTidy).
 */
export function usePlanPicks({ planned, address, setAddress, crossings }: PlanRoute, { s, course }: PlanAnswerModel) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  // The runways picked at the route's fields (useRunwayPicks).
  const runways = useRunwayPicks({ address, setAddress });
  // The route's ends named by their airports' idents, and picks at fields
  // the route no longer has let go (useRouteTidy).
  const { noApproaches } = useRouteTidy({ planned, address, setAddress });
  // The route's fields, their runways' fit and their patterns (useFieldPatterns).
  const { procedureAirports, fitAircraft, runwayFitInputs, patterns } = useFieldPatterns({
    planned,
    briefing: s.briefing,
    course,
    nav: s.nav,
    fuelGal: s.totals?.fuel_gal ?? null,
    pickedPatterns: runways.pickedPatterns,
    pickedTakeoffs: runways.pickedTakeoffs,
  });
  // The instrument procedures picked (useProcedurePicks).
  const procedures = useProcedurePicks({ planned, address, setAddress, procedureAirports, crossings, patterns });
  return { ...runways, noApproaches, procedureAirports, fitAircraft, runwayFitInputs, ...procedures };
}

/** What is picked at the route's fields, as the workspace's hooks read it. */
export type PlanPicks = ReturnType<typeof usePlanPicks>;
