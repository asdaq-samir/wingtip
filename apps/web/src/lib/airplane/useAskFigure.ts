import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tailOf } from "../aircraftChoice";
import { usePreferences } from "../preferences";
import { aircraftProfilesQuery } from "../queryClient";
import { figuresOfChoice, isFigureKey, needsOf, type FigureKey, type NeedsFigure } from "./figures";
import { readFigure } from "./figureWords";
import { isPutOff, openAirplaneProfile, putOff, useProfileOpen } from "./profileStore";
import { useSaveFigures } from "./useSaveFigures";

/** What a figure on screen lacks of the airplane picked, worked out by the
 *  engine (airplane_needs) from its profile (airplane_figures'), with the
 *  tables of `tables` -- the nav log's airplane's loading, takeoff and
 *  landing charts, which the planner's full profile has -- over it. */
export function missingFor(
  figure: NeedsFigure,
  profile: Record<string, unknown> | null,
  tables: Record<string, unknown> | null | undefined,
): string[] {
  return needsOf(profile && tables ? { ...tables, ...profile } : profile, figure);
}

/**
 * The one view model of every inline ask (components/airplane/AskFigure),
 * at the owner's rule (2026-11-09): a figure missing is asked for where and
 * when it is needed, never assumed. Which inputs the figure lacks (the
 * engine's), the first of them not put off asked with its field; Save keeps
 * it (useSaveFigures) and the figure is worked out again; Not now puts it
 * off this session; Edit opens the airplane's profile on it. With no
 * airplane picked, `none`: the screen says to pick one.
 */
export function useAskFigure(figure: NeedsFigure, tables?: Record<string, unknown> | null) {
  const aircraft = usePreferences((p) => p.aircraft);
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const notNow = useProfileOpen((s) => s.notNow);
  const save = useSaveFigures();
  const tail = tailOf(aircraft);
  const missing = useMemo(
    () => missingFor(figure, figuresOfChoice(aircraft, profiles).profile, tables),
    [figure, aircraft, profiles, tables],
  );
  const figures = missing.filter(isFigureKey);
  const asked = figures.find((k) => !tail || !isPutOff(notNow, tail, k)) ?? null;
  // The figure as typed (React Aria's NumberField, in the pilot's locale).
  const [typed, setTyped] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!asked || !tail) return;
    const read = readFigure(asked, typed);
    if ("problem" in read) {
      setProblem(read.problem);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await save(tail, { [asked]: read.value });
      setTyped(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : `${tail}'s figure could not be saved.`);
    } finally {
      setSaving(false);
    }
  };
  return {
    none: missing[0] === "airplane",
    tail,
    /** The figure asked for now; null where none is missing or all are put off. */
    asked,
    /** Whether anything at all is missing, put off or not. */
    missing: missing.length > 0,
    tables: missing.filter((k) => !isFigureKey(k) && k !== "airplane"),
    typed,
    setTyped,
    problem,
    saving,
    submit,
    notNow: () => asked && tail && putOff(tail, asked),
    edit: (key: FigureKey | null = asked) => tail && openAirplaneProfile(tail, key),
  };
}
