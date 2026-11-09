import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { forecastRun } from "./api";
import type { ForecastRun } from "../../../lib/api/types";
import { usePreferences } from "../../../lib/preferences";
import type { DryRun } from "../components/navlog/dryRun";
import type { RouteEnds } from "../components/navlog/rows";
import { usePastFlight } from "../map/pastFlight";
import { alertsBy, areasAt, forecastAsk, sampleAt } from "./forecastRun";

/** Forecast mode, on or off, and the answer the map draws from while the
 *  run plays (ForecastRunGl): the panel's hook asks, the map reads. */
export const useForecastMode = create<{ on: boolean; answer: ForecastRun | null }>(() => ({ on: false, answer: null }));

export function setForecastMode(on: boolean) {
  useForecastMode.setState(on ? { on } : { on, answer: null });
}

/**
 * The dry run played against the forecast (owner, 2026-11-09), the view
 * model of the dry run's forecast strip: with forecast mode on, the run
 * sent to the planner once (POST /api/forecast/run, the engine's
 * forecast_run) -- flown from the plan's departure time, so "leave at
 * 14:00" meets 14:00's forecast and on -- and, as it plays, what the
 * airplane meets where it is now, the alerts it has reached and the
 * advisory areas in force then. A new run (the route changed, the
 * departure moved) is asked again.
 */
export function useForecastRun(run: DryRun, ends: RouteEnds | null) {
  const on = useForecastMode((s) => s.on);
  const rules = usePreferences((s) => s.flightRules);
  const minimums = usePreferences((s) => s.minimums);
  const ask = on && ends && run.points.length >= 2 ? forecastAsk(run, ends, rules, minimums) : null;
  const query = useQuery({
    queryKey: ["forecastRun", ask],
    queryFn: () => forecastRun(ask!),
    enabled: !!ask,
    // The weather it is played against changes by the hour, not the second.
    staleTime: 5 * 60_000,
  });
  const answer = on ? (query.data ?? null) : null;
  useEffect(() => {
    useForecastMode.setState({ answer });
  }, [answer]);
  const now = usePastFlight((s) => Math.floor(s.at ?? run.points[0]?.t ?? 0));
  return {
    on,
    loading: on && query.isPending,
    error: on && query.isError ? query.error : null,
    answer,
    now,
    here: answer ? sampleAt(answer, now) : null,
    alerts: answer ? alertsBy(answer, now) : [],
    areas: answer ? areasAt(answer, now) : [],
  };
}
