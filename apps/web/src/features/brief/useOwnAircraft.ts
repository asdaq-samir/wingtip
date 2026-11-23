import { useQuery } from "@tanstack/react-query";
import { pilotQuery } from "../../lib/queryClient";
import { aircraftListQuery, currencyQuery } from "../../lib/queryClientRecords";
import { usePreferences } from "../../lib/preferences";

/** The signed-in pilot, their currency, and the airplane of theirs being flown. */
export function useOwnAircraft() {
  const { data: pilot } = useQuery(pilotQuery);
  const { data: currency } = useQuery({ ...currencyQuery, enabled: !!pilot });
  // The pilot's own airplane being flown, for its inspections and, under
  // IFR, its VOR check.
  const flyingId = usePreferences((p) => p.aircraft.aircraftId);
  const { data: ownAircraft } = useQuery({ ...aircraftListQuery, enabled: !!pilot && flyingId != null });
  const flownOwn = flyingId == null ? undefined : ownAircraft?.find((a) => a.id === flyingId);
  return { pilot, currency, flownOwn };
}
