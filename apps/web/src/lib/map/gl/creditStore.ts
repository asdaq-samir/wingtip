import { useEffect } from "react";
import { create } from "zustand";

/** The credits each layer owes its source while it is drawn (the imagery's,
 *  Google's, the traffic's), by the layer's own key. */
export const useCredits = create<{ credits: Record<string, string> }>(() => ({ credits: {} }));

/** A layer's credit at the map's foot while it is drawn, as its source's
 *  terms ask; none (null) while it has none to give. */
export function useMapCredit(key: string, html: string | null) {
  useEffect(() => {
    if (!html) return;
    useCredits.setState((s) => ({ credits: { ...s.credits, [key]: html } }));
    return () =>
      useCredits.setState((s) => {
        const { [key]: _gone, ...rest } = s.credits;
        return { credits: rest };
      });
  }, [key, html]);
}
