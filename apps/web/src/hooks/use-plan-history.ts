import { useCallback, useEffect, useMemo, useRef } from "react";
import { addressParams, loadAddress, type Address, type AddressChange, type SetAddress } from "../lib/address";
import { toast } from "../lib/toast";
import { usePlanUndo } from "../lib/planUndo";
import { usePreferences } from "../lib/preferences";
import { airplaneChosen, NO_AIRPLANE } from "../lib/prefs/airplaneSlice";
import { ADDRESS_HISTORY_KEYS, AIRPLANE_KEY } from "./planHistoryKeys";
import { observed, planStateOf, redone, restored, resumed, stepNames, undone, type PlanHistory } from "./planHistory";

/** The route's Undo toast up now, if any: one at a time, the next
 *  change's in its place. */
let routeUndo: string | null = null;

/** What it offered was done, or no longer applies. */
const dismissRouteUndo = () => {
  if (routeUndo) toast.close(routeUndo);
  routeUndo = null;
};

/** Typing in a field undoes the field's own text, the browser's way. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Where the history is kept across a reload: this tab's session, as the
 *  address it goes with is this tab's. */
const KEPT = "wingtip.planHistory";

function readKept(): unknown {
  try {
    const kept = sessionStorage.getItem(KEPT);
    return kept ? JSON.parse(kept) : null;
  } catch {
    return null; // refused or not JSON: a new history
  }
}

function keep(h: PlanHistory) {
  try {
    sessionStorage.setItem(KEPT, JSON.stringify({ past: h.past, now: h.now, future: h.future }));
  } catch {
    /* not kept: private browsing, storage full; Undo still works on this page */
  }
}

/**
 * The plan's Undo and Redo (hooks/planHistory), from the address the page
 * keeps it in and the airplane flown: each change taken in as it lands,
 * whichever button made it. Their one place is the toast's Undo and a
 * keyboard's Cmd-Z (lib/planUndo; the ••• menu's items went, the owner
 * 2026-11-21), named by what they put back. One that took something away -- the route cleared, a
 * stop removed, the route replaced by Fly Here or a Direct to, a
 * procedure taken off -- also puts up "Route Cleared · Undo" as a toast
 * with its Undo, the web's stock confirmation (the owner, 2026-11-10). A
 * keyboard's Cmd-Z or Ctrl-Z undoes any step, Shift with it (or Ctrl-Y)
 * redoes it. Kept in the tab's session, so a reload keeps the steps.
 */
export function usePlanHistory(address: Address, setAddress: SetAddress) {
  const history = useRef<PlanHistory | null>(null);
  const aircraft = usePreferences((p) => p.aircraft);
  const airplane = airplaneKey(aircraft);
  // The plan's keys as text, as the history keeps them.
  const state = useMemo(() => {
    const params = addressParams(address);
    if (airplane) params.set(AIRPLANE_KEY, airplane);
    return planStateOf(params);
  }, [address, airplane]);

  const told = useCallback((h: PlanHistory) => {
    keep(h);
    usePlanUndo.setState(stepNames(h));
  }, []);

  const go = useCallback(
    (step: typeof undone) => {
      if (!history.current) return false;
      const next = step(history.current, Date.now());
      if (!next) return false;
      history.current = next;
      told(next);
      dismissRouteUndo();
      // The plan's keys put back, each read by its parser; the page's own left.
      const back = loadAddress(restored(new URLSearchParams(), next.now));
      void setAddress(Object.fromEntries(ADDRESS_HISTORY_KEYS.map((key) => [key, back[key]])) as AddressChange);
      const flown = next.now[AIRPLANE_KEY];
      const prefs = usePreferences.getState();
      if ((flown ?? "") !== airplaneKey(prefs.aircraft)) {
        try {
          prefs.setAircraft(flown ? JSON.parse(flown) : NO_AIRPLANE);
        } catch {
          /* a kept airplane from another build: left as it is */
        }
      }
      return true;
    },
    [setAddress, told],
  );
  const undo = useCallback(() => go(undone), [go]);
  const redo = useCallback(() => go(redone), [go]);

  useEffect(() => {
    usePlanUndo.setState({ undo: () => void undo(), redo: () => void redo() });
  }, [undo, redo]);

  useEffect(() => {
    const now = Date.now();
    if (!history.current) {
      history.current = resumed(readKept(), state, now);
      told(history.current);
      return;
    }
    const { history: next, note } = observed(history.current, state, now);
    if (next === history.current) return;
    history.current = next;
    told(next);
    if (!note) return;
    dismissRouteUndo();
    routeUndo = toast.undo(note, undo, { onClose: () => (routeUndo = null) });
  }, [state, undo, told]);
  // The page gone, its Undo with it.
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
}

/** The airplane as the history keeps it: its JSON, or none. */
const airplaneKey = (aircraft: Parameters<typeof airplaneChosen>[0]) => (airplaneChosen(aircraft) ? JSON.stringify(aircraft) : "");
