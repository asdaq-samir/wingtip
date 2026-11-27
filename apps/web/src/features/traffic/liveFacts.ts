import { nameCase } from "./nameCase";
import { squawkMeaning } from "./squawks";
import type { FlightLive } from "./useFlightLive";

/**
 * What the airplane card's facts strip (AirplaneFacts) takes from the
 * flight's live data, where its "Now" section was (the owner, 2026-11-27):
 * who flies it, its squawk, and for traffic the FAA's registry does not
 * hold (`registry`) what it is and its own identifiers. The scheduled
 * route and the tower's departure time are its slide's ends and times.
 */
export function liveFacts(hex: string | null, live: FlightLive, registry: boolean) {
  const { plane, detail } = live;
  const squawk = plane?.squawk ?? null;
  return {
    operator: detail?.operator ? nameCase(detail.operator) : null,
    squawk,
    squawkAlarm: !!squawkMeaning(squawk),
    ...(registry && hex
      ? {
          record: detail?.faa ?? null,
          type: (detail?.description ? nameCase(detail.description) : null) ?? detail?.type ?? plane?.type ?? live.registered,
          year: detail?.year ?? null,
          traffic: { mark: detail?.registration ?? plane?.registration ?? null, address: hex, callsign: plane?.callsign?.trim() || null },
        }
      : {}),
  };
}
