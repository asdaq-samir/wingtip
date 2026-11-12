import { useCallback, useEffect, useMemo, useRef } from "react";
import { addressParams, loadAddress, type Address, type AddressChange, type SetAddress } from "../lib/address";
import { toast } from "../lib/toast";
import { PLAN_KEYS } from "../lib/address";
import { observed, planStateOf, redone, restored, started, undone, type PlanHistory } from "./planHistory";

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

/**
 * The plan's Undo and Redo (hooks/planHistory), from the address the page
 * keeps it in: each change of the route taken in as it lands, whichever
 * button made it. One that took something away -- the route cleared, a
 * stop removed, the route replaced by Fly Here or a Direct to, a
 * procedure taken off -- puts up "Route Cleared · Undo" as a toast with
 * its Undo, the web's stock confirmation (the owner, 2026-11-10). A
 * keyboard's Cmd-Z or Ctrl-Z undoes any step, Shift with it (or Ctrl-Y)
 * redoes it.
 */
export function usePlanHistory(address: Address, setAddress: SetAddress) {
  const history = useRef<PlanHistory | null>(null);
  // The plan's keys as text, as the history keeps them.
  const state = useMemo(() => planStateOf(addressParams(address)), [address]);

  const go = useCallback(
    (step: typeof undone) => {
      if (!history.current) return false;
      const next = step(history.current, Date.now());
      if (!next) return false;
      history.current = next;
      dismissRouteUndo();
      // The plan's keys put back, each read by its parser; the page's own left.
      const back = loadAddress(restored(new URLSearchParams(), next.now));
      void setAddress(Object.fromEntries(PLAN_KEYS.map((key) => [key, back[key]])) as AddressChange);
      return true;
    },
    [setAddress],
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
    dismissRouteUndo();
    routeUndo = toast.undo(note, undo, { testId: "route-undo", onClose: () => (routeUndo = null) });
  }, [state, undo]);
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

  return { undo, redo };
}
