import { nameCase } from "./nameCase";
import type { FlightLive } from "./useFlightLive";

/**
 * What the airplane card's facts strip (AirplaneFacts) takes from the
 * flight's live data, where its "Now" section was (the owner, 2026-11-27):
 * who flies it, and for traffic the FAA's registry does not
 * hold (`registry`) what it is and its ICAO address. The scheduled
 * route, the tower's departure time and its squawk are its slide's.
 * Given the parts it reads, not the whole flight, so the strip is drawn
 * again only when one of them changes, not at each 5-second report
 * (useAirplaneCardModel's `facts`).
 */
export function liveFacts(
  hex: string | null,
  { detail, planeType, registered }: { detail: FlightLive["detail"]; planeType: string | null; registered: string | null },
  registry: boolean,
) {
  return {
    operator: detail?.operator ? nameCase(detail.operator) : null,
    ...(registry && hex
      ? {
          record: detail?.faa ?? null,
          type: (detail?.description ? nameCase(detail.description) : null) ?? detail?.type ?? planeType ?? registered,
          year: detail?.year ?? null,
          traffic: { address: hex },
        }
      : {}),
  };
}
