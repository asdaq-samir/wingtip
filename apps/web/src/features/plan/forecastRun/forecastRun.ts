import type { ForecastRun, ForecastRunAsk } from "../../../lib/api/types";
import type { Minimums } from "../../../lib/minimums";
import type { FlightRules } from "../../../lib/preferences";
import { dryRunRow, type DryRun } from "../components/navlog/dryRun";
import type { RouteEnds } from "../components/navlog/rows";

/** The most points of a run sent: the planner takes up to 600, and every
 *  third of the run's two-mile points is a sample each six miles. */
const MOST_POINTS = 400;

/**
 * The dry run as the planner's forecast run takes it (POST
 * /api/forecast/run; the rule is the engine's forecast_run): its points
 * thinned to MOST_POINTS, its last kept, each with the nav log's row it is
 * flying to; its fields, the departure at the run's start and each landing
 * at the time the run is in; the flight rules and the pilot's ceiling and
 * visibility minimums.
 */
export function forecastAsk(run: DryRun, ends: RouteEnds, rules: FlightRules, minimums: Minimums): ForecastRunAsk {
  const every = Math.max(1, Math.ceil(run.points.length / MOST_POINTS));
  const kept = run.points.filter((_, i) => i % every === 0 || i === run.points.length - 1);
  const track = kept.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, alt_ft: p.alt_ft ?? null, row: dryRunRow(run, p.t) }));
  const at = new Map([ends.departure, ...(ends.stops ?? []), ends.destination].map((f) => [f.ident, f]));
  const landings = run.landings.flatMap((l, i) => {
    const f = at.get(l.ident);
    const role = i === run.landings.length - 1 ? ("destination" as const) : ("stop" as const);
    return f ? [{ ident: l.ident, role, t: l.t, lat: f.lat, lon: f.lon }] : [];
  });
  const dep = ends.departure;
  return {
    track,
    fields: [{ ident: dep.ident, role: "departure", t: run.points[0]!.t, lat: dep.lat, lon: dep.lon }, ...landings],
    rules: rules === "ifr" ? "IFR" : "VFR",
    minimums: { ceiling_ft: minimums.ceilingFt, visibility_sm: minimums.visibilitySm },
  };
}

/** The point of the forecast run the airplane last passed at `t`. */
export function sampleAt(answer: ForecastRun, t: number): ForecastRun["samples"][number] | null {
  let found: ForecastRun["samples"][number] | null = null;
  for (const s of answer.samples) {
    if (s.t > t) break;
    found = s;
  }
  return found ?? answer.samples[0] ?? null;
}

/** The alerts the run has reached by `t`, the newest first. */
export function alertsBy(answer: ForecastRun, t: number): ForecastRun["alerts"] {
  return answer.alerts.filter((a) => a.t <= t).reverse();
}

/** The advisory areas in force at `t`: what the map draws as the run plays. */
export function areasAt(answer: ForecastRun, t: number): ForecastRun["areas"] {
  return answer.areas.filter((a) => (a.valid_from == null || a.valid_from <= t) && (a.valid_to == null || t < a.valid_to));
}

/** An hour as forecasts write it, UTC: "14Z". */
export function hourZ(t: number): string {
  return `${new Date(t * 1000).toISOString().slice(11, 13)}Z`;
}

/** A time as forecasts write it, UTC: "1420Z". */
export function zulu(t: number): string {
  const iso = new Date(t * 1000).toISOString();
  return `${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

/** The products the planner could not have, in a pilot's words. */
const PRODUCT_WORDS: Record<string, string> = {
  tafs: "TAFs",
  airsigmets: "SIGMETs",
  gairmets: "G-AIRMETs",
  "spc-outlook": "the SPC outlook",
  "glmp-forecast": "the modelled hours (Gridded LAMP)",
  winds: "the winds aloft",
};

export function unavailableWords(names: string[]): string | null {
  if (!names.length) return null;
  return `Played without ${names.map((n) => PRODUCT_WORDS[n] ?? n).join(", ")}.`;
}
