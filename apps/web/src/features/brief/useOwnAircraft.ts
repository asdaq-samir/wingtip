import { useQuery } from "@tanstack/react-query";
import { pilotQuery } from "../../lib/queryClient";
import { aircraftListQuery } from "../../lib/queryClientRecords";
import { useCurrency } from "../../lib/useCurrency";
import { usePreferences } from "../../lib/preferences";

/** The signed-in pilot, their currency, and the airplane of theirs being flown. */
export function useOwnAircraft() {
  const { data: pilot } = useQuery(pilotQuery);
  // Judged for the airplane picked (14 CFR 61.57(a)(1)(ii)).
  const { data: currency } = useCurrency();
  // The pilot's own airplane being flown, for its inspections and, under
  // IFR, its VOR check.
  const flyingId = usePreferences((p) => p.aircraft.aircraftId);
  const { data: ownAircraft } = useQuery({ ...aircraftListQuery, enabled: !!pilot && flyingId != null });
  const flownOwn = flyingId == null ? undefined : ownAircraft?.find((a) => a.id === flyingId);
  return { pilot, currency, flownOwn };
}
