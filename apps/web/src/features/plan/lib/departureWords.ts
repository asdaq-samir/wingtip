/**
 * A flight's latest tower departure event in a line, for its card
 * (wingtip.departures, STDDS's TDES): "Cleared 0457Z at KIND, gate B20, to
 * KRSW (FAA TDES)". Only the times the event gives are said: the feed
 * sends the departure clearance's delivery (times.clearance_delivery),
 * which is not a takeoff, and is never called one.
 */
import type { DepartureEvent } from "../../../lib/api/types";
import { zulu } from "../../../lib/liveReports";

export function departureLine(e: DepartureEvent | undefined): string | null {
  if (!e) return null;
  const cleared = e.times?.clearance_delivery;
  const parts = [cleared != null ? `Cleared ${zulu(cleared)}` : "Departure event", e.departure ? `at ${e.departure}` : null]
    .filter(Boolean)
    .join(" ");
  const rest = [e.gate ? `gate ${e.gate}` : null, e.destination ? `to ${e.destination}` : null].filter(Boolean);
  return `${[parts, ...rest].join(", ")} (FAA TDES)`;
}
