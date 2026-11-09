import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromDevice } from "../../lib/airplane/saveFigures";
import { useSaveFigures } from "../../lib/airplane/useSaveFigures";
import { usePreferences } from "../../lib/preferences";
import { pilotQuery } from "../../lib/queryClient";

/** The first N-number this device keeps figures for, where any. */
export function firstKept(kept: Record<string, object>): string | null {
  return Object.entries(kept).find(([, figures]) => Object.keys(figures).length > 0)?.[0] ?? null;
}

/**
 * The view model of the offer made at sign-in (KeepFiguresOffer): figures a
 * pilot set for an N-number while signed out, kept on this device, offered
 * to their account, one N-number at a time. Save puts them on its record
 * (useSaveFigures, made where there is none) and takes them off the device;
 * Not now leaves them there and asks no more this session.
 */
export function useKeepFiguresOffer() {
  const { data: pilot } = useQuery(pilotQuery);
  const kept = usePreferences((p) => p.tailFigures);
  const save = useSaveFigures();
  const [declined, setDeclined] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tail = pilot && !declined ? firstKept(kept) : null;
  return {
    tail,
    problem,
    saving,
    keep: async () => {
      if (!tail) return;
      setSaving(true);
      setProblem(null);
      try {
        await save(tail, fromDevice(kept[tail]));
        usePreferences.getState().setTailFigures(tail, {});
      } catch (err) {
        setProblem(err instanceof Error ? err.message : `${tail}'s figures could not be saved.`);
      } finally {
        setSaving(false);
      }
    },
    decline: () => setDeclined(true),
  };
}
