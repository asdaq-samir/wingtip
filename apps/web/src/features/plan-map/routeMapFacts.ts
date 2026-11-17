import { placeWords } from "../../lib/advisories";
import type { Candidate, Course, Leg } from "../../lib/api/types";
import { type BriefingState, firstFlown } from "../plan";
import { coursePoints } from "../../lib/course";

/** RouteMap's facts for its marks: a checkpoint's place in the flight,
 *  a field's weather, the route's fields and a checkpoint's label. */

/** A checkpoint's place in the flight, from the nav log's legs: the leg
 *  that comes to it and the one that leaves it, by its name as the log
 *  names them, and how long after takeoff it is reached. */
export type LegFacts = { into?: Leg; out?: Leg; afterMin: number };

export function legFactsOf(selected: Candidate[], legs: Leg[]): Map<string, LegFacts> {
  const facts = new Map<string, LegFacts>();
  let from = 0;
  for (const c of selected) {
    if (!c.name) continue;
    const at = legs.findIndex((leg, i) => i >= from && leg.to === c.name);
    if (at < 0) continue;
    from = at + 1;
    // The time in the air to it: each leg's time, and any stop's on the
    // ground before it (ground_min).
    const afterMin = legs.slice(0, at + 1).reduce((sum, leg) => sum + (leg.ete_min ?? 0) + (leg.ground_min ?? 0), 0);
    facts.set(`${c.lat},${c.lon}`, { into: legs[at], out: firstFlown(legs[at + 1]), afterMin });
  }
  return facts;
}

/** What is known of a departure or destination's weather, for its
 *  chip's colour: its own METAR from the briefing. Each of "still
 *  checking", "could not be checked" and "checked, no report" says so;
 *  they used to share one "no report". */
export function weatherOf(ident: string, briefing: BriefingState): { status: string; category: string | null } {
  const ready = briefing.state === "ready" ? briefing : null;
  const metar = ready?.data.metars[ident];
  const status =
    briefing.state === "failed" || ready?.data.weather_unavailable.includes("metars")
      ? "unavailable"
      : !ready
        ? "checking"
        : metar
          ? "reported"
          : "no-report";
  return { status, category: metar?.flight_category ?? null };
}

/** The route's points in flown order, or, `each` false, each once: a round
 *  trip's departure is its destination, one chip on the map. */
export function routeAirports(course: Course, each = false) {
  const all = coursePoints(course);
  return each ? all : all.filter((a, i) => all.findIndex((b) => b.ident === a.ident) === i);
}

/** A checkpoint's name as its label shows it, in sentence case (the
 *  design review, 2026-10-28): the chart's name for the place as the
 *  places know it, "River near Lenroot", "Lake Zurich" (wingtip.places
 *  checkpoint_name), where its ForeFlight waypoint's capitals (RIVER
 *  LENROOT) were shouted over the chart; else that waypoint's words,
 *  spaced, spelt as a place's are, a code (a figure in it) as written --
 *  and so where the name is the bare kind ("River", the places not loaded
 *  yet) and the waypoint says more. A field its own name
 *  as a place's is spelt and its ident as written, "Wag-Aero (WI92)",
 *  where the pack's name for it is the route's ends and its number
 *  (C81DLH01), at the owner's yes (2026-10-24). */
export const labelOf = (c: Pick<Candidate, "waypoint" | "name" | "category">) => {
  if (c.category === "airport" && c.name) {
    const [, name = c.name, ident = ""] = /^(.*?)((?: \([A-Z0-9]+\))?)$/.exec(c.name.trim()) ?? [];
    return `${placeWords(name)}${ident}`;
  }
  const waypoint = (c.waypoint ?? "").replaceAll("_", " ").trim();
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  if (c.name && /[a-z]/.test(c.name) && words(c.name) >= words(waypoint)) return c.name.trim();
  return (waypoint || c.name || "")
    .split(/\s+/)
    .map((w) => (/\d/.test(w) ? w : placeWords(w)))
    .join(" ");
};
