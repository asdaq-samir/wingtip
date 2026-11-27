import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

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
 * `value` as last committed, in a ref: for what a handler, a listener or
 * an effect set up once reads when it runs (the field's value at its
 * blur, the caller's latest handlers as the Drawer tells it something),
 * so a new value need not set the handler up again. Written after each
 * commit, before paint, where each place wrote its own ref in an effect.
 * Read when something happens, never as a render goes.
 */
export function useLatest<T>(value: T): RefObject<T> {
  "use no memo"; // Written after every commit, as written by hand.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  return latest;
}

/**
 * The same function at every render, calling the one made last: for a
 * handler a hook makes afresh each render (useDryRun's start and stop),
 * so what carries it stays the same object (FPL's useKept). Called from a
 * tap, never as a render goes, so the last committed one is the one
 * called.
 */
export function useSteady<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  "use no memo"; // As useLatest.
  const latest = useLatest(fn);
  return useCallback((...args: A) => latest.current(...args), [latest]);
}
