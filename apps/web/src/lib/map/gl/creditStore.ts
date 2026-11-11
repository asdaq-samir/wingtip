import { useEffect } from "react";
import { create } from "zustand";

/** What each layer drawn says of its source and its currency while it is
 *  drawn (the imagery's source, the traffic's, the overlay tiles' FAA
 *  cycle, old field weather), by the layer's own key, in plain words:
 *  Status lists them (StatusPanel's "On the map"). */
export const useCredits = create<{ credits: Record<string, string> }>(() => ({ credits: {} }));

/** A layer's words for Status while it is drawn; none (null) while it has
 *  none to give. */
export function useMapCredit(key: string, words: string | null) {
  useEffect(() => {
    if (!words) return;
    useCredits.setState((s) => ({ credits: { ...s.credits, [key]: words } }));
    return () =>
      useCredits.setState((s) => {
        const { [key]: _gone, ...rest } = s.credits;
        return { credits: rest };
      });
  }, [key, words]);
}
