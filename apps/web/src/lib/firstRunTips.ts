/**
 * What a pilot has seen once on this device and is not shown again: the
 * first flight's welcome, the tip on the FPL tab after the first route
 * and the sunlight banner, each a key in one store kept in the browser.
 * Setup's Guide, Show First Flight Again, clears it. The welcome is the
 * owner's option A (2026-11-13): a sheet whose Find an Airport is the one
 * search. The other pointing first-run tips are gone (the owner,
 * 2026-11-11: "I like the stock behavior"); the FPL tab's is the one tip
 * left, once.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { browserStorage } from "./storage";

/** The first flight's welcome (FirstFlight), seen once it has planned a
 *  route or been put away: the store's key for it. */
export const FIRST_FLIGHT = "first-flight";

/** The tip on the FPL tab after the first route (FplTip), seen once closed. */
export const FPL_TIP = "fpl-tip";

/** Seen, every one: what the browser tests start from. */
const ALL_SEEN = "*";

export const useTips = create<{ seen: string[]; see: (id: string) => void; reset: () => void }>()(
  persist(
    (set) => ({ seen: [], see: (id) => set((s) => (s.seen.includes(id) ? s : { seen: [...s.seen, id] })), reset: () => set({ seen: [] }) }),
    { name: "wingtip.tips", storage: createJSONStorage(() => browserStorage) },
  ),
);

/** Whether a key is still to be shown. */
export const unseen = (seen: string[], id: string) => !seen.includes(ALL_SEEN) && !seen.includes(id);
