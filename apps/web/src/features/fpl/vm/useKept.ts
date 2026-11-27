import { useCallback, useLayoutEffect, useRef } from "react";

/** Whether two objects (or arrays) hold the same values under the same keys. */
export function sameFields(a: object, b: object): boolean {
  if (a === b) return true;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return keys.every((k) => Object.hasOwn(y, k) && Object.is(x[k], y[k]));
}

/**
 * The object made last render, while each of its values is the same as
 * this render's: the planner's view model's slices (usePlanWorkspace) are
 * built afresh at each render, as hooks the React Compiler leaves alone
 * (their "use no memo", for the first load's size), and a new slice with
 * nothing new in it drew every part handed it again -- the minute's clock,
 * a search's keystroke or one query's answer drew the map, the sheet's
 * pages and FPL's cards (the speed work's audit, 2026-11-27). Kept, a part
 * whose slices are as they were is skipped.
 *
 * Kept in a ref written as the render goes, which React's lint refuses
 * for a ref that draws something: this one only stands for an object with
 * the same values, so one kept from a render React threw away is as good
 * as the one it stands for, and nothing is drawn from it that the values
 * would not draw.
 */
export function useKept<T extends object>(next: T): T {
  "use no memo"; // As the slices that call it.
  const kept = useRef(next);
  // eslint-disable-next-line react-hooks/refs -- a cache of equal values, above
  if (!sameFields(kept.current, next)) kept.current = next;
  // eslint-disable-next-line react-hooks/refs -- as above
  return kept.current;
}

/**
 * The same function at every render, calling the one made last: for a
 * handler a hook outside FPL makes afresh each render (useDryRun's start
 * and stop), so the slice that carries it stays the same object (useKept).
 * Called from a tap, never as a render goes, so the last committed one is
 * the one called.
 */
export function useSteady<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  "use no memo"; // As useKept.
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
