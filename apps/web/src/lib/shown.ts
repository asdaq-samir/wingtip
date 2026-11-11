import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Whether what this is drawn in is in sight. A panel or a card once opened
 * is kept, hidden, under what is up now (TabKept: the tabs, the sheet's
 * cards; Setup's layer, MapPage), laid out but not painted, and kept would
 * mean working: its queries asked again on their timers, its clocks
 * ticking and its stores drawn again at every change, for something no one
 * can see. What is hidden stops, and catches up as it is back: a query
 * unsubscribed while hidden (TanStack Query's `subscribed`) asks again on
 * its return when what it has is stale, a store is read again, a clock
 * reads the time.
 *
 * Not for what a flight needs whatever is on screen: own ship's position,
 * the alerts ahead, the weather watch, the copilot and the map's layers
 * live outside the panel's kept bodies and never read this. Up wherever
 * nothing says otherwise.
 */
export const Shown = createContext(true);

export const useShown = () => useContext(Shown);

const still = () => () => {};

/**
 * A store's slice followed while in sight and not while hidden, so a store
 * that changes every second (own ship's fix, the traffic heard) draws
 * nothing that no one sees; back in sight, it is read again. The slice
 * must be one the store keeps (`s.seen`), not one made by the selector, as
 * useSyncExternalStore wants.
 */
export function useShownStore<S, T>(
  store: { subscribe: (listener: () => void) => () => void; getState: () => S },
  selector: (state: S) => T,
): T {
  const shown = useShown();
  return useSyncExternalStore(shown ? store.subscribe : still, () => selector(store.getState()));
}
