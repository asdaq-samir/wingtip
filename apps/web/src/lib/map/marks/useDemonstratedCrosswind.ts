import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { bookOf } from "../../airplane/figures";
import { usePreferences } from "../../preferences";
import { aircraftProfilesQuery } from "../../queryClient";

/** The picked airplane's maximum demonstrated crosswind, knots: its type's
 *  POH figure (the planner's stock profile), for the map's wind arrows to
 *  go red past it; null with no airplane, an own airplane of no stock
 *  type, or a profile with no such figure -- the arrows then never red, no
 *  other airplane's figure assumed (the owner, 2026-11-09). */
export function useDemonstratedCrosswind(): number | null {
  const aircraft = usePreferences((p) => p.aircraft);
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  return useMemo(
    () => (aircraft.none ? null : (bookOf(aircraft.profile, profiles)?.crosswind?.demonstrated_kt ?? null)),
    [aircraft, profiles],
  );
}
