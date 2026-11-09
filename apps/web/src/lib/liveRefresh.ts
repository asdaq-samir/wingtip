import { queryClient } from "./queryClient";

/** What each live card asks again on a pull (PullToRefresh), by its
 *  queries' first key: the field's answer with its weather and the live
 *  ATIS and RVR; the briefing with the live reports it reads; traffic
 *  round the airplane and what is known of each flight. */
const LIVE = {
  airport: ["airport", "live"],
  brief: ["briefing", "live"],
  traffic: ["traffic", "trafficFind", "flight", "flight-status"],
} as const;

/** The queries a card has on the screen now, asked again; resolved once
 *  every answer is in (or has failed, which the card says itself). */
export function refreshLive(card: keyof typeof LIVE): Promise<void> {
  const keys: readonly string[] = LIVE[card];
  return queryClient.refetchQueries({ type: "active", predicate: (q) => keys.includes(String(q.queryKey[0])) });
}
