import { nameCase } from "./nameCase";
import type { FlightLive } from "./useFlightLive";

/**
 * What the airplane card's facts strip (AirplaneFacts) takes from the
 * flight's live data, where its "Now" section was (the owner, 2026-11-27):
 * who flies it, and for traffic the FAA's registry does not
 * hold (`registry`) what it is and its ICAO address. The scheduled
 * route, the tower's departure time and its squawk are its slide's.
 */
export function liveFacts(hex: string | null, live: FlightLive, registry: boolean) {
  const { plane, detail } = live;
  return {
    operator: detail?.operator ? nameCase(detail.operator) : null,
    ...(registry && hex
      ? {
          record: detail?.faa ?? null,
          type: (detail?.description ? nameCase(detail.description) : null) ?? detail?.type ?? plane?.type ?? live.registered,
          year: detail?.year ?? null,
          traffic: { address: hex },
        }
      : {}),
  };
}
