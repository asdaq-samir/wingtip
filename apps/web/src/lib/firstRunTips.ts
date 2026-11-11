/**
 * What a pilot has seen once on this device and is not shown again: the
 * welcome, the first flight's card, the sunlight banner, each a key in one
 * store kept in the browser. Setup's Guide, Show Welcome Again, clears it.
 * The pointing first-run tips that also kept their keys here are gone (the
 * owner, 2026-11-11: "I like the stock behavior"): nothing points at a
 * control by itself; the welcome and Ready to Fly's prompt say what is new.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { browserStorage } from "./storage";

/** The first flight's card (FirstFlight), seen once it has planned a
 *  route or been closed: the store's key for it. */
export const FIRST_FLIGHT = "first-flight";

/** The welcome (features/plan/components/welcome), seen once it has been
 *  finished or skipped: before the first flight's card, and brought back
 *  by the Guide's Show Welcome Again. */
export const WELCOME = "welcome";

/** Whether the welcome is still to be shown on this device: what holds
 *  the page's own asks back (locateOnOpen's location) until it has said
 *  why. */
export const welcomeDue = () => unseen(useTips.getState().seen, WELCOME);

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
