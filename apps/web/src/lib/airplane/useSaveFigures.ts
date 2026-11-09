import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { choiceOf, tailOf } from "../aircraftChoice";
import { api } from "../api/client";
import type { Aircraft, AircraftChoice } from "../api/types";
import { usePreferences } from "../preferences";
import { aircraftListQuery, aircraftProfilesQuery, pilotQuery } from "../queryClient";
import { FIGURE_FIELDS, bookOf, type FigureKey } from "./figures";
import { deviceWith, figuresOnly, newRecord, recordWith, type FigureChanges } from "./saveFigures";

/** The airplane flown with `changes` over its own figures, a reset one
 *  taken out so its type's book figure stands. */
function choiceWith(choice: AircraftChoice, changes: FigureChanges): AircraftChoice {
  const next: AircraftChoice = { ...choice };
  for (const [key, value] of Object.entries(changes) as [FigureKey, number | null][]) {
    if (value == null) delete next[FIGURE_FIELDS[key]];
    else next[FIGURE_FIELDS[key]] = value;
  }
  return next;
}

/**
 * Keeps a pilot's own figures for an N-number, the one way the inline asks
 * (components/airplane/AskFigure) and the airplane's profile
 * (features/airplane) both save: signed in, on their record -- only the
 * figures given added (PUT /api/aircraft/{id}/figures), the record again
 * for a reset or a cruise figure, a new record for an N-number they have
 * none for, on its type's book figures -- and signed out on this device,
 * offered to the account at sign-in. The airplane flown, where it is this
 * one, is flown on them at once, and so its figures are worked out again.
 */
export function useSaveFigures() {
  const queryClient = useQueryClient();
  const { data: pilot } = useQuery(pilotQuery);
  const { data: list } = useQuery({ ...aircraftListQuery, enabled: !!pilot });
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  return useCallback(
    async (tail: string, changes: FigureChanges, typeDesignator: string | null = null, profile = ""): Promise<Aircraft | null> => {
      const n = tail.toUpperCase();
      const prefs = usePreferences.getState();
      const flown = prefs.aircraft;
      const flying = tailOf(flown) === n;
      if (!pilot) {
        prefs.setTailFigures(n, deviceWith(prefs.tailFigures[n], changes));
        if (flying) prefs.setAircraft(choiceWith(flown, changes));
        return null;
      }
      const record = list?.find((a) => a.tailNumber.toUpperCase() === n) ?? null;
      const book = bookOf(record ? choiceOf(record, profiles ?? []).profile : profile || (flying ? flown.profile : ""), profiles);
      let saved: Aircraft;
      if (record) {
        const only = figuresOnly(changes);
        saved = only
          ? await api.aircraft.figures(record.id, only)
          : await api.aircraft.update(record.id, recordWith(record, changes, book));
      } else {
        const request = newRecord(n, typeDesignator, book, prefs.tailFigures[n], changes);
        if (!request) throw new Error(`Add ${n}'s cruise speed and fuel burn first: its record needs them.`);
        saved = await api.aircraft.add(request);
      }
      queryClient.setQueryData(aircraftListQuery.queryKey, (old) =>
        record ? (old ?? []).map((a) => (a.id === saved.id ? saved : a)) : [...(old ?? []), saved],
      );
      if (flying) prefs.setAircraft(choiceOf(saved, profiles ?? []));
      return saved;
    },
    [pilot, list, profiles, queryClient],
  );
}
