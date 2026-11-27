import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { keepingAvailable } from "../../lib/map/route/keepRoute";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { useKeptValue } from "../../lib/storage";
import { keptStatesStore, replaced, statesQuery, unfinished, useStateDownloads } from "./keptStates";

/**
 * The kept states kept current, mounted with the map: a state whose fetch
 * stopped (the page closed) goes on, and once a kept state's cycle is
 * replaced -- 0901Z on the next AIRAC date, as the planner gave it -- the
 * new cycle is fetched and the old one's pages deleted when it is whole.
 * Asked once a minute, and only with a service worker to keep them in.
 */
export function useStatePlatesFresh() {
  const client = useQueryClient();
  const now = useMinuteClock();
  const kept = useKeptValue(keptStatesStore());
  useEffect(() => {
    if (!kept.length || !keepingAvailable() || !navigator.onLine) return;
    const running = useStateDownloads.getState().running;
    const due = kept.filter((k) => !running.includes(k.id) && (replaced(k, now) || unfinished(k)));
    if (!due.length) return;
    void (async () => {
      // The fetching asked for now, off the first load (statePlates).
      const { keepState } = await import("./statePlates");
      const latest = due.some((k) => replaced(k, now)) ? await client.fetchQuery({ ...statesQuery, staleTime: 0 }).catch(() => null) : null;
      for (const k of due) {
        // The cycle the planner now serves, where it has turned over.
        const cycle = replaced(k, now) && latest?.cycle ? latest.cycle : k.cycle;
        if (cycle !== k.cycle || unfinished(k)) void keepState(client, k.id, cycle);
      }
    })();
  }, [client, now, kept]);
}
