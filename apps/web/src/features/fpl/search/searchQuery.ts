import { create } from "zustand";

/**
 * What is typed in the one search, in a store of its own rather than the
 * workspace's state: read by the search's
 * own parts (OneSearchRoot's useOneSearch, the sidebar's Recents), so a
 * keystroke draws them and not the whole workspace -- the map, FPL's
 * pages and its cards. Set by the field and by
 * a pick that lets the words go.
 */
export const useSearchQuery = create<{ query: string; setQuery: (query: string) => void }>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));

/** What is typed let go (a pick of Home, a Favorite, an airplane kept). */
export const clearSearchQuery = () => useSearchQuery.getState().setQuery("");
