import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { choiceOf, profileOfRegistered, tailOf } from "../../lib/aircraftChoice";
import { api } from "../../lib/api/client";
import { airplaneFigures, bookOf, handbookOf, type FigureKey } from "../../lib/airplane/figures";
import { readFigure } from "../../lib/airplane/figureWords";
import { closeAirplaneProfile, useProfileOpen } from "../../lib/airplane/profileStore";
import { fromDevice, type FigureChanges } from "../../lib/airplane/saveFigures";
import { useSaveFigures } from "../../lib/airplane/useSaveFigures";
import { usePreferences } from "../../lib/preferences";
import { aircraftListQuery, aircraftProfilesQuery, pilotQuery } from "../../lib/queryClient";
import { ownOfRecord, resettable, typeWords } from "./profileModel";
import { usePhotoRead } from "./usePhotoRead";

/** `map` without `key`. */
function without<T>(map: Partial<Record<FigureKey, T>>, key: FigureKey): Partial<Record<FigureKey, T>> {
  const next = { ...map };
  delete next[key];
  return next;
}

/**
 * The airplane profile's one view model (MVVM), at the owner's ask
 * (2026-11-09: "tapping any N-number opens that airplane's profile with
 * every figure editable"): its N-number, its type (its record's, else the
 * FAA registry's, the lookup the picker already makes), and every figure
 * with where it comes from -- the engine's airplane_figures over the
 * type's book, its photographed handbook page and the pilot's own. A
 * figure changed is kept as the pilot's for this N-number alone
 * (useSaveFigures: their record, made at the first edit on the type's book
 * figures, or this device signed out); "Reset to book figure" puts the
 * book's back. The view (AirplaneProfileSheet) only draws this.
 */
export function useAirplaneProfile() {
  const open = useProfileOpen((s) => s.open);
  const tail = open?.tail ?? "";
  const { data: pilot } = useQuery(pilotQuery);
  const { data: list } = useQuery({ ...aircraftListQuery, enabled: !!pilot });
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const flown = usePreferences((p) => p.aircraft);
  const device = usePreferences((p) => p.tailFigures[tail]);
  const record = list?.find((a) => a.tailNumber.toUpperCase() === tail) ?? null;
  // The FAA's registry for its type, the picker's own lookup (FlightInputs).
  const registry = useQuery({
    queryKey: ["registered", tail],
    queryFn: () => api.trafficFind(tail),
    staleTime: 24 * 60 * 60_000,
    enabled: !!tail && !record,
    meta: { silent: true },
  });
  const registered = registry.data?.registered ?? null;
  const profileName = record
    ? choiceOf(record, profiles ?? []).profile
    : tailOf(flown) === tail && flown.profile
      ? flown.profile
      : registered
        ? (profileOfRegistered(registered) ?? "")
        : "";
  const book = bookOf(profileName, profiles);
  const figures = useMemo(
    () => airplaneFigures(book, handbookOf(record?.handbook), record ? ownOfRecord(record) : fromDevice(device)),
    [book, record, device],
  );
  const save = useSaveFigures();
  const [drafts, setDrafts] = useState<Partial<Record<FigureKey, string>>>({});
  const [problems, setProblems] = useState<Partial<Record<FigureKey, string>>>({});
  const [busy, setBusy] = useState<FigureKey | null>(null);
  /** Figures kept as the pilot's (null: the book's put back), at once. */
  const keep = async (changes: FigureChanges) => {
    const keys = Object.keys(changes) as FigureKey[];
    setBusy(keys[0] ?? null);
    try {
      await save(tail, changes, record?.typeDesignator ?? null, profileName);
      setDrafts((d) => keys.reduce(without, d));
      setProblems((p) => keys.reduce(without, p));
    } catch (err) {
      const problem = err instanceof Error ? err.message : "Not saved: try again.";
      setProblems((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, problem])) }));
    } finally {
      setBusy(null);
    }
  };
  /** The fields' text, those given, kept as the pilot's figures where they
   *  changed; one out of its bounds said under it and not kept. */
  const commit = (...keys: FigureKey[]) => {
    const changes: FigureChanges = {};
    for (const key of keys) {
      const typed = drafts[key];
      if (typed === undefined) continue;
      const now = figures.figures.find((f) => f.key === key)?.value ?? null;
      const read = typed.trim() ? readFigure(key, typed) : null;
      if (read && "problem" in read) setProblems((p) => ({ ...p, [key]: read.problem }));
      else if (read && read.value !== now) changes[key] = read.value;
      else setDrafts((d) => without(d, key));
    }
    if (Object.keys(changes).length) void keep(changes);
  };
  const photo = usePhotoRead((typed) => setDrafts((d) => ({ ...d, ...typed })));
  return {
    open: !!open,
    close: closeAirplaneProfile,
    tail,
    focus: open?.focus ?? null,
    type: typeWords(record, registered, book?.type),
    rows: figures.figures.map((f) => ({ ...f, key: f.key as FigureKey, resettable: resettable(f) })),
    drafts,
    setDraft: (key: FigureKey, text: string) => setDrafts((d) => ({ ...d, [key]: text })),
    commit,
    /** Every field changed kept at once: the figures read off a photo. */
    commitAll: () => commit(...(Object.keys(drafts) as FigureKey[])),
    reset: (key: FigureKey) => void keep({ [key]: null }),
    photo,
    problems,
    busy,
  };
}

export type AirplaneProfileModel = ReturnType<typeof useAirplaneProfile>;
