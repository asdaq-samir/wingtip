import { useCallback, useEffect, useRef } from "react";
import { prefetchAirport } from "../../../lib/queryClient";

/** How long a row lit by the arrows or the pointer stays lit before its
 *  card's answer is asked: arrowing down the list passes each row in less,
 *  so only the row the pilot stops on is asked for, not one request a row. */
const LINGER_MS = 150;

/** And a row lit as the pilot types (autoHighlight's first row, lit anew
 *  at nearly every key): asked only once the typing has paused, so a word
 *  typed on a phone is not a request a letter. */
const TYPING_MS = 400;

/**
 * The one search's lit row, as the Autocomplete lights it (its arrows, a
 * mouse over it, autoHighlight's first row): an airport's card's answer
 * (prefetchAirport, PlaceCard's) asked once it has stayed lit a moment, so
 * the card opens on it at Enter or a tap; a moment longer for the row lit
 * by typing. Only an airport row's value, its ident, among `idents`; an
 * airplane's or a waypoint's row asks nothing. `details` is the
 * Autocomplete's onItemHighlighted's: its reason "keyboard" or "pointer"
 * for a row the pilot lit, "none" for autoHighlight's.
 */
export function usePrefetchHighlighted(idents: readonly string[]) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (value: unknown, details?: { reason?: string }) => {
      clearTimeout(timer.current);
      if (typeof value !== "string" || !idents.includes(value)) return;
      const ms = details?.reason === "keyboard" || details?.reason === "pointer" ? LINGER_MS : TYPING_MS;
      timer.current = setTimeout(() => prefetchAirport(value), ms);
    },
    [idents],
  );
}
