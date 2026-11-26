import { callEngine } from "../../lib/engine/engine";
import type { LatLon } from "../../lib/geo";
import type { TrafficAircraft } from "../../lib/api/types";

/**
 * When an airplane in the air will reach the field it is bound for, flown
 * direct from where it is now at the ground speed it sends: the engine's
 * in_flight, as the pilot's own next checkpoint is asked (features/plan's
 * flyingTo), its line from here to the field. Unix seconds; null below
 * flying speed (the engine's `underway`) or where it has no speed. Direct,
 * not its airway route, which adsb.lol does not send: a rough "Arrives" for
 * the card's live box (the owner's design, 2026-11-26), not an airline's.
 */
export function arrivalOf(here: LatLon, plane: TrafficAircraft, to: LatLon, nowMs: number): number | null {
  const answer = callEngine("in_flight", {
    fix: { lat: here.lat, lon: here.lon, track_deg: plane.track_deg ?? null, speed_kt: plane.speed_kt ?? null },
    line: [
      [here.lat, here.lon],
      [to.lat, to.lon],
    ],
    // The route's points from its start, as a nav log's are: the airplane
    // where it is, then the field.
    points: [
      { name: "here", lat: here.lat, lon: here.lon },
      { name: "destination", lat: to.lat, lon: to.lon },
    ],
    now_s: nowMs / 1000,
  });
  return answer?.destination?.eta_s ?? null;
}
