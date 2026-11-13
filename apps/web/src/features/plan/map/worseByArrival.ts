import { useMemo } from "react";
import type { Briefing, Course } from "../../../lib/api/types";
import type { BriefingState } from "../hooks/usePlan";
import { callEngine } from "../../../lib/engine/engine";
import { ownStation, placesOf } from "../components/briefing/fieldWeather";
import { useGeo, type Geo } from "../../../lib/geo";

/** A field's ceiling and visibility as weather_worse reads one. */
type Reading = { ident: string; ceiling_ft: number | null; visibility_sm: number | null; ceiling_unknown: boolean; arrival?: boolean };

/**
 * The plan's fields whose weather gets worse by the pilot's time there,
 * for the map's amber ↓ (the owner's pick, 2026-11-10): the engine's
 * weather_worse, asked with each field's METAR now as the earlier reading
 * and its own TAF for the flight's time there (the planner's ETA along the
 * route, ForecastStation's eta_*) as the later one -- a worse flight
 * category, and worse than VFR (AIM 7-1-7). The departure, the stops and
 * the destination; a field with no METAR or no TAF of its own has nothing
 * to compare, and no badge. Off the route, none.
 */
export function worseByArrival(geo: Geo, briefing: Briefing, course: Course): string[] {
  const stations = briefing.forecast.stations;
  const then: Reading[] = [];
  const now: Reading[] = [];
  for (const place of placesOf(geo, course)) {
    const metar = briefing.metars[place.ident];
    const station = ownStation(stations, place.ident);
    if (!metar || !station?.eta) continue;
    then.push({
      ident: place.ident,
      ceiling_ft: metar.ceiling_ft ?? null,
      visibility_sm: metar.visibility_sm ?? null,
      ceiling_unknown: !!metar.ceiling_unknown,
    });
    now.push({
      ident: place.ident,
      ceiling_ft: station.eta_ceiling_ft ?? null,
      visibility_sm: station.eta_visibility_sm ?? null,
      ceiling_unknown: !!station.eta_ceiling_unknown,
      arrival: true,
    });
  }
  if (!now.length) return [];
  const { worse } = callEngine("weather_worse", { then: { tafs: then }, now: { tafs: now } });
  return worse.flatMap((w) => (w.ident ? [w.ident] : []));
}

const NONE: string[] = [];

/** worseByArrival of the route's briefing once it is in, none before. */
export function useWorseByArrival(briefing: BriefingState, course: Course | null): string[] {
  const ready = briefing.state === "ready" ? briefing.data : null;
  const geo = useGeo();
  return useMemo(() => (geo && ready && course ? worseByArrival(geo, ready, course) : NONE), [geo, ready, course]);
}
