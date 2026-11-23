import type { AircraftProfile } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { balance, type Balance, type Load } from "../../lib/weightBalance";

/**
 * The airplane's load as the pilot last set it, kept per airplane in this
 * browser. Only that load is this flight's: the weight and balance is the
 * flight's own load against the POH's limits (14 CFR 91.9(a), 91.103), so
 * with none set `saved` and `result` are null, the Go / No-Go says "give
 * your load" (the engine's no_load) and the runways are read at the POH
 * table's heaviest weight, as the planner does (app/gonogo/flight.py).
 * The editor's starting load, a sample the pilot accepts, is the Brief's
 * (features/brief/useLoadEditor), never anyone else's figure.
 */
export function useLoad(aircraft: AircraftProfile | null | undefined, tripFuelGal: number | null) {
  const key = aircraft?.name ?? "";
  const stored = usePreferences((s) => s.loads[key]);
  const setLoad = usePreferences((s) => s.setLoad);
  const loading = aircraft?.loading ?? null;
  const saved: Load | null = loading ? (stored ?? null) : null;
  const result: Balance | null = loading && saved ? balance(loading, saved, tripFuelGal) : null;
  return { key, loading, saved, result, setLoad: (next: Load) => setLoad(key, next) };
}
