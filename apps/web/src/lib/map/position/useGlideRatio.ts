import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { glideRatioOf } from "../../aircraftChoice";
import { usePreferences } from "../../preferences";
import { aircraftProfilesQuery } from "../../queryClient";

/** The picked airplane's glide ratio (aircraftChoice's glideRatioOf), for
 *  the Nearest card's glide and the glide ring; null with none, and then no
 *  glide. */
export function useGlideRatio(): number | null {
  const aircraft = usePreferences((p) => p.aircraft);
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  return useMemo(() => glideRatioOf(aircraft, profiles), [aircraft, profiles]);
}
