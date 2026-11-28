import { useState } from "react";
import type { AircraftProfile } from "../../lib/api/types";
import { balance, defaultLoad, type Load } from "../../lib/weightBalance";
import { useLoad } from "../plan";
import { useOwnAircraft } from "./useOwnAircraft";

/**
 * Weight & Balance's editor (PreflightSections' WeightBalanceSection).
 * Only a load the pilot set is this flight's (14 CFR 91.9(a), 91.103), so
 * until one is saved the editor shows a sample, labelled as one: the
 * airplane's own empty weight and moment from its weight and balance
 * record where the pilot gave both, else the POH's sample airplane, with
 * the engine's sample pilot and full usable tanks (gonogo_default_load).
 * Editing the sample changes this screen's copy alone; only Use This Load
 * saves it, so a pilot's weight typed in never files the POH's sample
 * airplane as theirs. A saved load is edited in place.
 */
export function useLoadEditor(aircraft: AircraftProfile | null | undefined, tripFuelGal: number | null) {
  const { key, loading, saved, setLoad } = useLoad(aircraft, tripFuelGal);
  const own = useOwnAircraft().flownOwn?.figures;
  const ownWeight = own?.emptyWeightLb ?? null;
  const ownMoment = own?.emptyMomentLbIn ?? null;
  // The record's empty figures stand for the POH's sample's, as the MCP
  // connector's load does (app/mcp/airplane.py), the arm the engine's.
  const ownEmpty = ownWeight != null && ownMoment != null && ownWeight > 0;
  const [edit, setEdit] = useState<{ key: string; load: Load } | null>(null);
  const start: Load | null = loading
    ? defaultLoad(
        ownEmpty ? { ...loading, sample_empty_weight_lb: ownWeight, sample_empty_moment_lb_in: ownMoment } : loading,
        aircraft?.usable_fuel_gal ?? loading.fuel_max_gal,
      )
    : null;
  const load: Load | null = saved ?? (edit?.key === key ? edit.load : null) ?? start;
  const result = loading && load ? balance(loading, load, tripFuelGal) : null;
  return {
    loading,
    load,
    result,
    saved,
    /** Whether the airplane's empty weight and arm are its own record's. */
    ownEmpty,
    change: (next: Load) => (saved ? setLoad(next) : setEdit({ key, load: next })),
    /** The sample, as the pilot checked and changed it, made their load. */
    accept: () => {
      if (load) setLoad(load);
    },
  };
}
