import { useEffect, useRef } from "react";
import { queryClient } from "./queryClient";
import { useShown } from "./shown";

/** What each live card asks again, by its queries' first key: the field's
 *  answer with its weather and the live ATIS and RVR; the briefing with
 *  the live reports it reads; traffic round the airplane and what is
 *  known of each flight. */
const LIVE = {
  airport: ["airport", "live"],
  brief: ["briefing", "live"],
  traffic: ["traffic", "trafficFind", "flight", "flight-status"],
} as const;

export type LiveCard = keyof typeof LIVE;

const ofCard = (card: LiveCard) => {
  const keys: readonly string[] = LIVE[card];
  return (q: { queryKey: readonly unknown[] }) => keys.includes(String(q.queryKey[0]));
};

/** The queries a card has on the screen now, asked again (its Refresh);
 *  resolved once every answer is in (or has failed, which the card says
 *  itself). */
export function refreshLive(card: LiveCard): Promise<void> {
  return queryClient.refetchQueries({ type: "active", predicate: ofCard(card) });
}

/**
 * A live card kept fresh by itself: what it shows asked again, where it
 * has gone stale (each query's own staleTime), as the card is back in
 * sight under the sheet's others (lib/shown). The window coming back into
 * focus is TanStack Query's own refetch on focus (lib/queryClient), which
 * asks every stale query again, the card's among them.
 */
export function useLiveRefresh(card: LiveCard): void {
  const shown = useShown();
  const wasShown = useRef(shown);
  useEffect(() => {
    const back = shown && !wasShown.current;
    wasShown.current = shown;
    if (back) void queryClient.refetchQueries({ type: "active", stale: true, predicate: ofCard(card) });
  }, [shown, card]);
}
