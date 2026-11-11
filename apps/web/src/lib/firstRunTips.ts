/**
 * What a pilot has seen once on this device and is not shown again: the
 * first flight's card and the sunlight banner, each a key in one store
 * kept in the browser. Setup's Guide, Show First Flight Again, clears it.
 * The welcome card is gone (the owner, 2026-11-11: "We don't need the
 * welcome"): FPL's "Plan a flight" offers its Search and sample flight.
 * The pointing first-run tips that also kept their keys here are gone (the
 * owner, 2026-11-11: "I like the stock behavior"): nothing points at a
 * control by itself; Ready to Fly's prompt says what is new.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { browserStorage } from "./storage";

/** The first flight's card (FirstFlight), seen once it has planned a
 *  route or been closed: the store's key for it. */
export const FIRST_FLIGHT = "first-flight";

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
