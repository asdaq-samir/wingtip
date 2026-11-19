import { create } from "zustand";

/**
 * What is typed in Nearest's field, at its card's top (NearestCard,
 * listSearch's nearSearch): the field writes it, the list reads it, and the
 * list says what Return and the clear do (`submitNear`, `clearNear`), since
 * it knows what was found. The traffic's own field that was here went for
 * the one search (the owner, 2026-11-14).
 */
interface TabSearch {
  near: string;
  submitNear: (() => void) | null;
  /** Nearest's clear: back to the position, not only an empty field. */
  clearNear: (() => void) | null;
}

export const useTabSearch = create<TabSearch>(() => ({ near: "", submitNear: null, clearNear: null }));
