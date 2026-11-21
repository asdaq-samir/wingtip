import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A page the pilot marked, named as they named it. */
export interface Bookmark {
  page: number;
  label: string;
}

interface ReaderPlaces {
  /** The page each document was last left at, by its name (a library
   *  document's id or "own:<id>"). */
  pages: Record<string, number>;
  bookmarks: Record<string, Bookmark[]>;
  /** White on black for the night; null follows the app's appearance. */
  inverted: boolean | null;
  leftAt: (doc: string, page: number) => void;
  /** A bookmark on the page, or the one there taken off. */
  toggleBookmark: (doc: string, page: number, label: string) => void;
  renameBookmark: (doc: string, page: number, label: string) => void;
  setInverted: (inverted: boolean) => void;
}

/** The most pages a document's bookmarks hold: a pilot's tabs, not an index. */
const MOST_BOOKMARKS = 50;

/**
 * Where the pilot was in each document, their bookmarks and the night's
 * inverted pages, kept on this device as the reader's settings are
 * (ForeFlight's last page, bookmarks with names and Invert Colors).
 */
export const useReaderPlaces = create<ReaderPlaces>()(
  persist(
    (set) => ({
      pages: {},
      bookmarks: {},
      inverted: null,
      leftAt: (doc, page) => set((s) => (s.pages[doc] === page ? s : { pages: { ...s.pages, [doc]: page } })),
      toggleBookmark: (doc, page, label) =>
        set((s) => {
          const marks = s.bookmarks[doc] ?? [];
          const next = marks.some((m) => m.page === page)
            ? marks.filter((m) => m.page !== page)
            : [...marks, { page, label }].sort((a, b) => a.page - b.page).slice(0, MOST_BOOKMARKS);
          return { bookmarks: { ...s.bookmarks, [doc]: next } };
        }),
      renameBookmark: (doc, page, label) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            [doc]: (s.bookmarks[doc] ?? []).map((m) => (m.page === page && label.trim() ? { ...m, label: label.trim() } : m)),
          },
        })),
      setInverted: (inverted) => set({ inverted }),
    }),
    { name: "wingtip.readerPlaces", version: 1, partialize: (s) => ({ pages: s.pages, bookmarks: s.bookmarks, inverted: s.inverted }) },
  ),
);

/** A document's places forgotten with it (a pilot's own taken away). */
export function forgetPlaces(doc: string): void {
  useReaderPlaces.setState((s) => {
    const { [doc]: _page, ...pages } = s.pages;
    const { [doc]: _marks, ...bookmarks } = s.bookmarks;
    return { pages, bookmarks };
  });
}
