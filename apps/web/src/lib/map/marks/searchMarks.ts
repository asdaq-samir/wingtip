import { create } from "zustand";

/** One airport the one search found, as its numbered mark on the map: its
 *  number in the results (from one), and where it is. */
export interface SearchMark {
  ident: string;
  n: number;
  lat: number;
  lon: number;
}

/**
 * The one search's airports as numbered marks on a desktop's map while its
 * results are up, as Google Maps numbers a search's pins
 * (docs/design/web.md §1): set by the search (useOneSearch), drawn by
 * SearchMarksGl. `hot` is the airport under the pointer, on its row or its
 * mark, each highlighting the other; `open` opens one's card, as its row
 * does.
 */
export const useSearchMarks = create<{ marks: SearchMark[]; hot: string | null; open: ((ident: string) => void) | null }>(() => ({
  marks: [],
  hot: null,
  open: null,
}));

/** The pointer on an airport's row or mark, or off it (null). */
export const setSearchHot = (ident: string | null) => {
  if (useSearchMarks.getState().hot !== ident) useSearchMarks.setState({ hot: ident });
};
