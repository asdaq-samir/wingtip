import type { AltitudeChoice, Leg, NavLogAltitude } from "../../../../../lib/api/types";
import { callEngine } from "../../../../../lib/engine/engine";

/** Which plan an altitude several plans share is taken as, after the one
 *  flown: the planner's default, Fastest, first. */
const PREFERRED: AltitudeChoice[] = ["fastest", "economical", "lowest", "highest"];

/** The altitude a plan cruises at: the highest of its steps. */
const topOf = (o: { steps: { altitude_ft: number }[] }) => Math.max(...o.steps.map((s) => s.altitude_ft));

/** The cruising altitude the log flies: the highest of its legs once they
 *  are in, a point's own altitude among them (RouteBox), else of the
 *  plan's steps -- one figure, as an EFB's route has; null before there
 *  is one. */
export function cruiseOf(nav: NavLogAltitude | null, legs: Leg[]): number | null {
  if (!nav || nav.flown === null) return null;
  const plan = nav.options.find((o) => o.kind === nav.flown);
  const flown = legs.length
    ? legs.map((leg) => leg.altitude_ft)
    : plan
      ? plan.steps.map((st) => st.altitude_ft)
      : nav.altitude_ft !== null
        ? [nav.altitude_ft]
        : [];
  return flown.length ? Math.max(...flown) : null;
}

/** A plan that cruises at `altitude`: the one flown where it does, else
 *  by PREFERRED -- what setting that altitude flies, its steps and all. */
export function planAt(nav: NavLogAltitude | null, altitude: number): AltitudeChoice | null {
  const at = (nav?.options ?? []).filter((o) => o.steps.length && topOf(o) === altitude).map((o) => o.kind);
  if (nav?.flown && at.includes(nav.flown as AltitudeChoice)) return nav.flown as AltitudeChoice;
  return PREFERRED.find((kind) => at.includes(kind)) ?? null;
}

/** The altitude flown: a pilot's own as asked, else the plan's cruise. */
export const flownOf = (nav: NavLogAltitude | null, legs: Leg[]) =>
  nav?.flown === "custom" && nav.altitude_ft !== null ? nav.altitude_ft : cruiseOf(nav, legs);

export type AdvisorRow = ReturnType<typeof advisorRows>[number];

/** The advisor's rows, the engine's (altitude_advisor): every altitude of
 *  the wheel, highest first, with the planner's figures where it has them,
 *  Fastest and Most economical marked from its plans, and the rows
 *  outside the route's legal altitudes warned of, never left out. */
export function advisorRows(nav: NavLogAltitude | null, flown: number | null) {
  if (!nav) return [];
  return callEngine("altitude_advisor", {
    figures: nav.altitude_figures ?? [],
    flown_ft: flown,
    plans: nav.options.filter((o) => o.steps.length).map((o) => ({ kind: o.kind, altitude_ft: topOf(o) })),
  });
}
