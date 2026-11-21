import { patternsOf } from "../../lib/trafficPattern";
import { autoOf } from "./planAddress";

/**
 * The runways the nav log is asked with (usePlanRoute): the pilot's own,
 * and a runway picked into the wind only once it is no longer the one first
 * picked there for the route.
 *
 * Why: the nav log is asked with `wind_runways` (lib/api/plannerRoute), and
 * the planner then picks the runway into the wind at every field the ask
 * names none for, from the same report by the same rule the page picks it
 * by as the field's card comes in (the planner's wingtip.flight_procedures
 * wind_picks: "so a first plan flies its patterns and is the plan the page
 * then asks for"). Asked with the page's picks as well, the route's nav log
 * waited about a second for the cards and the picks (usePlanRoute's
 * `settling`, the speed audit of 2026-11-21: Add Fuel Stops' nav log left
 * 0.96-1.40 s after the tap), or was asked twice, once before them and once
 * after, for the same answer. A runway the wind turns later, or one the
 * pilot picks, is asked for by name, and the route planned again with it.
 */

/** Each runway picked into the wind ("land:KDLH" → "27"), from the
 *  address's `auto`, `pattern` and `takeoff`. */
export function windPickedEnds(auto: string | null, pattern: string | null, takeoff: string | null): Record<string, string> {
  const landing = patternsOf(pattern),
    leaving = patternsOf(takeoff);
  return Object.fromEntries(
    [...autoOf(auto, pattern, takeoff)].flatMap((key) => {
      const [which, ident] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      const end = (which === "takeoff" ? leaving : landing).get(ident);
      return end ? [[key, end]] : [];
    }),
  );
}

/** The wind's first picks for a route: `ends` (windPickedEnds) kept as
 *  they were first seen for `route` (its fields comma-joined), a field
 *  picked for the first time added; a new route starts again from `ends`.
 *  The same object while nothing is new, so a render can set it. */
export interface FirstWindPicks {
  route: string;
  ends: Record<string, string>;
}
export function firstWindPicks(prev: FirstWindPicks, route: string, ends: Record<string, string>): FirstWindPicks {
  if (prev.route !== route) return { route, ends };
  const unseen = Object.entries(ends).filter(([key]) => !(key in prev.ends));
  return unseen.length ? { route, ends: { ...prev.ends, ...Object.fromEntries(unseen) } } : prev;
}

/** The runways a list names ("KDLH:27,C81:24"), less each the planner
 *  picks itself: those picked into the wind still as first picked
 *  (`first`). `which` says a field's pick is a landing's or a takeoff's
 *  (the departures' list takes a field's takeoff where one is picked,
 *  else its landing: planAddress's departureRunways). */
export function askedRunways(
  list: string,
  which: (ident: string) => "land" | "takeoff",
  ends: Record<string, string>,
  first: Record<string, string>,
): string {
  return list
    .split(",")
    .filter((entry) => {
      if (!entry) return false;
      const ident = entry.slice(0, entry.lastIndexOf(":"));
      const key = `${which(ident)}:${ident}`;
      return !(key in ends && first[key] === ends[key]);
    })
    .join(",");
}
