import { useCallback, useEffect, useRef } from "react";
import { airportQuery, queryClient } from "../../../lib/queryClient";

/** How long a row stays lit before its card's answer is asked: arrowing
 *  down the list passes each row in less, so only the row the pilot stops
 *  on is asked for, not one request a row. */
const LINGER_MS = 150;

/**
 * The one search's lit row, as the Autocomplete lights it (its arrows, a
 * mouse over it, autoHighlight's first row): an airport's card's answer
 * (airportQuery, PlaceCard's) asked once it has stayed lit a moment, so
 * the card opens on it at Enter or a tap (the speed work, 2026-11-27).
 * Only an airport row's value, its ident, among `idents`; an airplane's
 * or a waypoint's row asks nothing.
 */
export function usePrefetchHighlighted(idents: readonly string[]) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (value: unknown) => {
      clearTimeout(timer.current);
      if (typeof value !== "string" || !idents.includes(value)) return;
      timer.current = setTimeout(() => void queryClient.prefetchQuery(airportQuery(value)), LINGER_MS);
    },
    [idents],
  );
}
