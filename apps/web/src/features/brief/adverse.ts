import type { Briefing } from "../../lib/api/types";
import { gairmetTitle, pirepConditions, sigmetHazard } from "../../lib/advisories";
import { callEngine, type EngineAnswer } from "../../lib/engine/engine";

/** The Brief's Adverse Conditions rows (AIM 7-1-5(b)(1)): at most three,
 *  the engine's `gonogo_adverse_rows`, and how many more there are. */
export type Adverse = EngineAnswer<"gonogo_adverse_rows">;
export type AdverseRow = Adverse["rows"][number];

const NONE: Adverse = { rows: [], more: 0 };

/**
 * What the briefing holds that the flight meets on the route, as one list
 * for the engine to choose from, order and cap (gonogo_adverse_rows): its
 * SIGMETs, G-AIRMETs, TFRs and pilot reports, each with where and when
 * the flight meets it (the planner's `on_route`). The engine says which
 * are adverse (a TFR crossed, an urgent PIREP) and in what order; the
 * names are the FAA's words as every page says them (lib/advisories).
 * The briefing has no Center Weather Advisories yet: the rule takes them
 * when it does.
 */
export function adverseRows(briefing: Briefing | null): Adverse {
  if (!briefing) return NONE;
  const met = (o: Briefing["hazards"][number]["on_route"]) => ({
    when: o?.when ?? null,
    enter: o?.enter ?? null,
    valid_to: o?.valid_to ?? null,
    from_nm: o?.from_nm ?? null,
    legs: o?.legs ?? [],
  });
  const quiet = { issued: null, crosses: false, urgent: false };
  const advisories = [
    ...briefing.hazards.map((h) => ({
      ...quiet,
      ...met(h.on_route),
      source: h.on_route?.source ?? h.type ?? "SIGMET",
      name: sigmetHazard(h.hazard, h.type),
    })),
    ...briefing.gairmets.map((g) => ({ ...quiet, ...met(g.on_route ?? null), source: "G-AIRMET", name: gairmetTitle(g) })),
    ...briefing.tfrs.map((t) => ({
      ...quiet,
      ...met(t.on_route ?? null),
      source: "TFR",
      name: [t.notam_id, t.title].filter(Boolean).join(" "),
      crosses: t.crosses,
    })),
    ...briefing.pireps.map((p) => ({
      ...quiet,
      ...met(p.on_route ?? null),
      source: "PIREP",
      name: pirepConditions(p),
      issued: p.on_route?.issued ?? p.observed_at ?? null,
      urgent: p.urgent,
    })),
  ];
  return advisories.length ? callEngine("gonogo_adverse_rows", { advisories }) : NONE;
}
