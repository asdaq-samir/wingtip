import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_NOTAMS, type NotamFilter, type NotamSort } from "./notamView";

/** How many of each mark are kept: a NOTAM lives days to weeks, and the
 *  oldest marks go first once there are more than a season's flying. */
const KEPT = 200;

interface NotamMarksState {
  pinned: string[];
  read: string[];
  filter: NotamFilter;
  sort: NotamSort;
  togglePin: (id: string) => void;
  toggleRead: (id: string) => void;
  setFilter: (filter: NotamFilter) => void;
  setSort: (sort: NotamSort) => void;
}

const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-KEPT));

/**
 * The pilot's own marks on the Brief's NOTAMs, by the NOTAM's id, and how
 * the list was last filtered and sorted: kept per browser in localStorage,
 * a convenience only (lost, the list is the engine's ranking again). Its
 * own store, not the app's preferences, so the NOTAM feature keeps its
 * state to itself.
 */
export const useNotamMarks = create<NotamMarksState>()(
  persist(
    (set) => ({
      pinned: [],
      read: [],
      filter: ALL_NOTAMS,
      sort: "rank",
      togglePin: (id) => set((s) => ({ pinned: toggled(s.pinned, id) })),
      toggleRead: (id) => set((s) => ({ read: toggled(s.read, id) })),
      setFilter: (filter) => set({ filter }),
      setSort: (sort) => set({ sort }),
    }),
    { name: "wingtip.notams.marks", partialize: (s) => ({ pinned: s.pinned, read: s.read, filter: s.filter, sort: s.sort }) },
  ),
);
