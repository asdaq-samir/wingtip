import { useSyncExternalStore } from "react";

/**
 * A confirmation said where it happened: "Flight Saved" by the Save the
 * pilot tapped, not in a banner across the top of the screen. The UI
 * audit (2026-11-09) counted 17 success toasts against the rule that
 * errors and confirmations show where they happen (CLAUDE.md; lib/problems
 * for the errors). `done` takes the control that has the focus -- the one
 * just tapped -- as the place, or the one passed; DoneNotes draws the
 * word beside it for two seconds, and says it to a screen reader.
 */
export type DoneNote = { id: number; words: string; detail?: string; at: { x: number; top: number; bottom: number } };

const DURATION_MS = 2000;
let notes: DoneNote[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Where a note goes: over the control's middle, or with no control (one
 *  taken off the screen by the tap, a sheet closing) at the screen's. */
function placeOf(el: Element | null): DoneNote["at"] {
  const r = el && el !== document.body ? el.getBoundingClientRect() : null;
  if (!r || (!r.width && !r.height)) return { x: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
  return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
}

/** Says `words` (Title Case, as the app's labels are) at the control just
 *  used, or at `near`. */
export function done(words: string, options: { detail?: string; near?: Element | null } = {}): void {
  if (typeof document === "undefined") return;
  const note: DoneNote = { id: next++, words, detail: options.detail, at: placeOf(options.near ?? document.activeElement) };
  notes = [...notes, note];
  emit();
  window.setTimeout(() => {
    notes = notes.filter(n => n.id !== note.id);
    emit();
  }, DURATION_MS);
}

/** The notes showing now, for DoneNotes. */
export function useDoneNotes(): DoneNote[] {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => notes,
    () => notes,
  );
}
