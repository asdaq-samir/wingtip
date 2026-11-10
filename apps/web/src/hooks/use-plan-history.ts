import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SetURLSearchParams } from "react-router";
import { create } from "zustand";
import { observed, planStateOf, redone, restored, started, undone, type PlanHistory } from "./planHistory";

/**
 * The route's Undo bar's words and its Undo, for the bar under the route
 * (features/plan RouteUndoBar) to draw: one at a time, the next change's
 * in its place, `at` telling one "KMSN Removed" from the next.
 */
export const useRouteUndo = create<{ note: string | null; at: number; undo: (() => void) | null }>(() => ({
  note: null,
  at: 0,
  undo: null,
}));

/** The bar's time is up, or what it offered was done. */
export const dismissRouteUndo = () => useRouteUndo.setState({ note: null, undo: null });

/** Typing in a field undoes the field's own text, the browser's way. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * The plan's Undo and Redo (hooks/planHistory), from the address the page
 * keeps it in: each change of the route taken in as it lands, whichever
 * button made it. One that took something away -- the route cleared, a
 * stop removed, the route replaced by Fly Here or a Direct to, a
 * procedure taken off -- puts up "Route Cleared · Undo" in the bar under
 * the route, where the change was made (useRouteUndo), as the iPhone has
 * it, not in a toast (docs/navigation.md: Undo where it happened). A
 * keyboard's Cmd-Z or Ctrl-Z undoes any step, Shift with it (or Ctrl-Y)
 * redoes it.
 */
export function usePlanHistory(searchParams: URLSearchParams, setSearchParams: SetURLSearchParams) {
  const history = useRef<PlanHistory | null>(null);
  const state = useMemo(() => planStateOf(searchParams), [searchParams]);

  const go = useCallback(
    (step: typeof undone) => {
      if (!history.current) return false;
      const next = step(history.current, Date.now());
      if (!next) return false;
      history.current = next;
      dismissRouteUndo();
      setSearchParams((prev) => restored(prev, next.now), { replace: true });
      return true;
    },
    [setSearchParams],
  );
  const undo = useCallback(() => go(undone), [go]);
  const redo = useCallback(() => go(redone), [go]);

  useEffect(() => {
    const now = Date.now();
    if (!history.current) {
      history.current = started(state, now);
      return;
    }
    const { history: next, note } = observed(history.current, state, now);
    history.current = next;
    if (!note) return;
    useRouteUndo.setState({ note, at: now, undo });
  }, [state, undo]);
  // The page gone, its bar with it.
  useEffect(() => dismissRouteUndo, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || typing(event.target)) return;
      const key = event.key.toLowerCase();
      const wanted = key === "z" ? (event.shiftKey ? redo : undo) : key === "y" && event.ctrlKey ? redo : null;
      if (wanted?.()) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { undo, redo };
}
