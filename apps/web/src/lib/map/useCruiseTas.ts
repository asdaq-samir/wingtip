import { useQuery } from "@tanstack/react-query";
import { cruiseTasOf } from "../aircraftChoice";
import { usePreferences } from "../preferences";
import { aircraftListQuery, aircraftProfilesQuery } from "../queryClient";

/** The airplane's cruise speed, for the ruler's time en route: the pilot's
 *  own airplane's, else its type's. */
export function useCruiseTas(): number | null {
  const remembered = usePreferences((p) => p.aircraft);
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const { data: mine } = useQuery({ ...aircraftListQuery, enabled: remembered.aircraftId != null });
  const own = remembered.aircraftId != null ? mine?.find((a) => a.id === remembered.aircraftId) : undefined;
  return cruiseTasOf(own ? { ...remembered, cruiseTasKt: own.cruiseTasKt } : remembered, profiles);
}
