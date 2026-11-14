import { startTransition, useMemo, useOptimistic, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { choiceOf, profileOfRegistered, tailChoice, tailOf } from "../../lib/aircraftChoice";
import { airplaneFigures, bookOf, handbookOf, type FigureKey } from "../../lib/airplane/figures";
import { readFigure } from "../../lib/airplane/figureWords";
import { closeAirplaneProfile, useProfileOpen } from "../../lib/airplane/profileStore";
import { fromDevice, type FigureChanges } from "../../lib/airplane/saveFigures";
import { useSaveFigures } from "../../lib/airplane/useSaveFigures";
import { wantScreen } from "../../lib/navigation/wanted";
import { usePreferences } from "../../lib/preferences";
import { aircraftListQuery, aircraftProfilesQuery, pilotQuery } from "../../lib/queryClient";
import { ownOfRecord, ownWith, resettable, typeWords } from "./profileModel";
import { usePhotoRead } from "./usePhotoRead";
import { useAirplaneCard } from "./useAirplaneCard";

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
  // What the card says of the airplane itself (useAirplaneCard): the FAA's record, for its type
  // too (the picker's own lookup, FlightInputs), its flights and whether it is in the air.
  const card = useAirplaneCard(tail);
  const registered = card.record;
  const profileName = record
    ? choiceOf(record, profiles ?? []).profile
    : tailOf(flown) === tail && flown.profile
      ? flown.profile
      : registered
        ? (profileOfRegistered(registered) ?? "")
        : "";
  const book = bookOf(profileName, profiles);
  const own = useMemo(() => (record ? ownOfRecord(record) : fromDevice(device)), [record, device]);
  // A figure kept shows as the pilot's at once (useOptimistic), worked out
  // again over it while it is saved; refused, the record's comes back by
  // itself, the typed text left in its field with why under it.
  const [shownOwn, changeOwn] = useOptimistic(own, ownWith);
  const figures = useMemo(() => airplaneFigures(book, handbookOf(record?.handbook), shownOwn), [book, record, shownOwn]);
  const save = useSaveFigures();
  const [drafts, setDrafts] = useState<Partial<Record<FigureKey, number | null>>>({});
  const [problems, setProblems] = useState<Partial<Record<FigureKey, string>>>({});
  const [busy, setBusy] = useState<FigureKey | null>(null);
  /** Figures kept as the pilot's (null: the book's put back), at once:
   *  an Action, the figures shown changed while the record is saved. */
  const keep = (changes: FigureChanges) => {
    const keys = Object.keys(changes) as FigureKey[];
    setBusy(keys[0] ?? null);
    startTransition(async () => {
      changeOwn(changes);
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
    });
  };
  /** The figures given, kept as the pilot's where they changed; one out
   *  of its bounds said under it and not kept, and left in its field. A
   *  field emptied keeps the figure it had. */
  const commit = (typed: Partial<Record<FigureKey, number | null>>) => {
    const changes: FigureChanges = {};
    for (const [key, value] of Object.entries(typed) as [FigureKey, number | null][]) {
      const now = figures.figures.find((f) => f.key === key)?.value ?? null;
      const read = value == null ? null : readFigure(key, value);
      if (read && "problem" in read) {
        setDrafts((d) => ({ ...d, [key]: value }));
        setProblems((p) => ({ ...p, [key]: read.problem }));
      } else if (read && read.value !== now) changes[key] = read.value;
      else setDrafts((d) => without(d, key));
    }
    if (Object.keys(changes).length) keep(changes);
  };
  // Fly This Airplane (the one search, 2026-11-09): this N-number the
  // plan's airplane -- its record where it is the pilot's, else its type's
  // book under its N-number with the figures kept for it here -- and the
  // plan shown, flown for it. Its type unknown, it is flown on the
  // pilot's own figures alone, which the plan asks for where missing.
  const flying = tailOf(flown) === tail;
  const fly = () => {
    usePreferences
      .getState()
      .setAircraft(record ? choiceOf(record, profiles ?? []) : tailChoice(tail, profileName, usePreferences.getState().tailFigures[tail]));
    closeAirplaneProfile();
    wantScreen("fpl");
  };
  const photo = usePhotoRead((typed) => setDrafts((d) => ({ ...d, ...typed })));
  return {
    open: !!open,
    close: closeAirplaneProfile,
    flying,
    fly,
    tail,
    focus: open?.focus ?? null,
    type: typeWords(record, registered, book?.type),
    rows: figures.figures.map((f) => ({ ...f, key: f.key as FigureKey, resettable: resettable(f) })),
    drafts,
    /** A figure as its field is left (React Aria's NumberField commits on
     *  blur or Enter), kept as the pilot's. */
    change: (key: FigureKey, value: number | null) => commit({ [key]: value }),
    /** Every field changed kept at once: the figures read off a photo. */
    commitAll: () => commit(drafts),
    reset: (key: FigureKey) => keep({ [key]: null }),
    photo,
    problems,
    busy,
    /** The card's own: its record, actions, flights and status line. */
    card,
  };
}

export type AirplaneProfileModel = ReturnType<typeof useAirplaneProfile>;
