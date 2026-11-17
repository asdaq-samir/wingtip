import type { Briefing, Leg, NavLogAltitude } from "../../lib/api/types";
import type { BriefingState } from "../plan";
import { feetRange } from "../../lib/format";

/** What each weather source is called when a pilot is told it could
 *  not be checked. */
export const WEATHER_SOURCE_LABEL: Record<Briefing["weather_unavailable"][number], string> = {
  hazards: "SIGMETs",
  forecast: "the TAF forecast",
  metars: "current METARs",
  tfrs: "TFRs",
  pireps: "pilot reports",
  gairmets: "G-AIRMETs",
};

interface Stretch {
  from: string;
  to: string;
  altitudeFt: number;
  wind: { dir: number; speed: number } | null;
  /** The forecast temperature there, whole degrees; null where none was
   *  near (a standard day was flown). */
  oatC: number | null;
}

/** Consecutive legs flown in the same wind and temperature at the same
 *  altitude, as one stretch of the route: many legs share their nearest
 *  winds-aloft station, and so report the same forecast. From the nav
 *  log's own per-leg winds and temperatures -- a summary of what it
 *  already fetched, not a second call. */
export function windStretches(legs: Leg[]): Stretch[] {
  const stretches: Stretch[] = [];
  for (const leg of legs) {
    const wind = leg.wind ? { dir: Math.round(leg.wind.wind_dir_true_deg), speed: Math.round(leg.wind.wind_speed_kt) } : null;
    const oatC = leg.oat_c == null ? null : Math.round(leg.oat_c);
    const last = stretches[stretches.length - 1];
    const same =
      last &&
      last.altitudeFt === leg.altitude_ft &&
      last.oatC === oatC &&
      (last.wind === null ? wind === null : wind !== null && last.wind.dir === wind.dir && last.wind.speed === wind.speed);
    if (same) last.to = leg.to;
    else stretches.push({ from: leg.from, to: leg.to, altitudeFt: leg.altitude_ft, wind, oatC });
  }
  return stretches;
}

/** The altitudes a plan flies as the nav log's header gives them: one
 *  figure, or its lowest and highest. */
export function altitudeRange(nav: NavLogAltitude): string {
  const chosen = nav.options.find((o) => o.kind === nav.flown);
  const alts = chosen ? chosen.steps.map((s) => s.altitude_ft) : nav.altitude_ft != null ? [nav.altitude_ft] : [];
  if (alts.length === 0) return "No altitude";
  return feetRange(alts);
}

/** What the briefing's parts say while it is not in: that it follows the
 *  course, that it could not be had, or that it is on its way. */
export function briefingPendingMessage(state: BriefingState): string {
  return state.state === "waiting"
    ? "The briefing follows once the route's course is drawn."
    : state.state === "failed" && state.detail
      ? `Briefing data is unavailable (${state.detail}).`
      : "Fetching METARs, forecasts, hazards, runways and frequencies…";
}
