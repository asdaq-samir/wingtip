import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AircraftChoice } from "../../../lib/api/types";
import { aircraftKey, choiceOf } from "../../../lib/aircraftChoice";
import { usePreferences } from "../../../lib/preferences";
import { aircraftListQuery, aircraftProfilesQuery, pilotQuery } from "../../../lib/queryClient";

/**
 * The airplane the nav log is computed for (usePlanWorkspace): remembered
 * per browser (the preferences store), since a pilot flies the same one
 * for a while; a stock profile until they pick one of their own. With the
 * picker's choices and its two ways to change it.
 */
export function useAircraftPick() {
  const remembered = usePreferences((p) => p.aircraft);
  const setAircraft = usePreferences((p) => p.setAircraft);
  // The stock profiles, plus a signed-in pilot's own airplanes on top
  // of them -- the same ["pilot"]/["aircraft"] queries the pilot
  // console keeps.
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const { data: pilot } = useQuery(pilotQuery);
  const { data: myAircraft } = useQuery({ ...aircraftListQuery, enabled: !!pilot });
  const aircraftOptions = useMemo<AircraftChoice[]>(() => {
    // The pilot's own airplanes alone, by their N-numbers, at the owner's
    // asks ("The airplane picker should pick an airplane by N number", "No
    // airplane should only be picked by n-number"): any other is typed by
    // its N-number (FlightInputs' registry lookup). The stock profiles are
    // what those fly on, not choices of their own.
    const options: AircraftChoice[] = (myAircraft ?? []).map((a) => choiceOf(a, profiles ?? []));
    // The remembered choice stays selectable while the lists load, and
    // an airplane deleted since is still what this plan was flown in.
    return options.some((o) => aircraftKey(o) === aircraftKey(remembered)) ? options : [remembered, ...options];
  }, [profiles, myAircraft, remembered]);
  // Flown with its numbers as they are now, not as they were when it
  // was picked: the remembered choice is which airplane, and an edit
  // in the pilot console (a climb burn added, say) re-plans. It used to
  // fly the copy remembered at the pick until it was picked again.
  const aircraft = aircraftOptions.find((o) => aircraftKey(o) === aircraftKey(remembered)) ?? remembered;

  // A different airplane means different legs: remembered, and the
  // nav log's own key changes with it.
  const changeAircraft = useCallback(
    (value: string) => {
      const next = aircraftOptions.find((o) => aircraftKey(o) === value);
      if (next) setAircraft(next);
    },
    [aircraftOptions, setAircraft],
  );
  // An airplane the FAA's registry has, typed by its N-number in the
  // picker: flown on its type's stock profile, named by its N-number.
  const pickTail = useCallback(
    (tail: string, profile: string) => {
      // With the figures the pilot set for it, where they have (AirplaneFigures).
      setAircraft({ profile, label: `${tail} · ${profile.toUpperCase()}`, tail, ...usePreferences.getState().tailFigures[tail] });
    },
    [setAircraft],
  );

  // The airplane made again only when it changes, as the chips are drawn
  // again only then (fromRoutePanel's memo).
  const aircraftValue = aircraftKey(aircraft);
  const aircraftChoices = useMemo(() => aircraftOptions.map((o) => ({ value: aircraftKey(o), label: o.label })), [aircraftOptions]);

  return { profiles, aircraft, aircraftValue, aircraftChoices, changeAircraft, pickTail };
}
