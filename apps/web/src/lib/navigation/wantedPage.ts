import { create } from "zustand";

/**
 * A console's page asked for from outside it -- the strip's one field
 * ("logbook", "instructor"), its profile menu, the Debrief card after
 * the destination (features/strip) -- as the path of page keys down to
 * it: ["logbook", "instructing"] is Setup's Logbook, then its
 * Instructing. Each ConsolePages on the way takes the first key it has a
 * page for, opens it and leaves the rest for the pages inside it; a key
 * none of them has stays until the next ask replaces it, so a
 * page still fetching its list (Flights) opens the flight once the list
 * is in.
 */
export const useWantedPage = create<{
  path: string[];
  /** Asked from inside the console already up (You's own gear opening
   *  Settings): opened as its row opens it, its close back to the list,
   *  not out of the console. */
  inside: boolean;
  want: (path: string[], inside?: boolean) => void;
  /** The first key taken by the console that had it: the rest is for
   *  the pages inside. */
  took: () => void;
}>((set) => ({
  path: [],
  inside: false,
  want: (path, inside = false) => set({ path, inside }),
  took: () => set((s) => ({ path: s.path.slice(1) })),
}));
