import type { Aircraft, LogbookEntryRequest } from "../../../lib/api/types";
import { savedKindOf } from "../../../lib/airplaneKind";

/** Whether an entry says its airplane's category, class or gear. */
export const entrySaysKind = (e: Pick<LogbookEntryRequest, "category" | "aircraftClass" | "tailwheel">) =>
  !!e.category || !!e.aircraftClass || (e.tailwheel != null && (e.tailwheel as unknown) !== "");

/**
 * An entry filled in with the category, class and gear of the airplane it
 * names, from that airplane's profile (14 CFR 61.57(a)(1)(ii): passenger
 * currency counts only the landings an entry says were in the same
 * category and class, and toward a tailwheel only one said to be a
 * tailwheel): only where the entry says none of them, and `from` the tail
 * number they came from, for the form to say so; else the entry as it was.
 */
export function withSavedKind(
  entry: LogbookEntryRequest,
  airplanes: Aircraft[] | undefined,
): { entry: LogbookEntryRequest; from: string | null } {
  const saved = entrySaysKind(entry) ? null : savedKindOf(airplanes, entry.aircraft);
  if (!saved) return { entry, from: null };
  const { category, aircraftClass, tailwheel } = saved.kind;
  return {
    entry: { ...entry, category: category ?? null, aircraftClass: aircraftClass ?? null, tailwheel: tailwheel ?? null },
    from: saved.tail,
  };
}

/** The form's values as the gateway takes them: its boxes hold "" where
 *  nothing is said, which is none to the gateway (each counted toward no
 *  passenger currency, 61.57(a)(1)), not an empty word or a zero. */
export function requestOfForm(values: LogbookEntryRequest): LogbookEntryRequest {
  const none = <T>(v: T) => ((v as unknown) === "" ? null : v);
  return {
    ...values,
    category: none(values.category),
    aircraftClass: none(values.aircraftClass),
    tailwheel: none(values.tailwheel),
    fullStopLandings: none(values.fullStopLandings),
    flightId: none(values.flightId),
  };
}
