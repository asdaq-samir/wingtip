import { create } from "zustand";

/**
 * The plan's one Undo and Redo, for the one place a pilot finds them: the
 * toast's Undo and a keyboard's Cmd-Z (the FPL redesign, the
 * owner 2026-11-17; the ••• menu's items went, 2026-11-21). The history
 * itself is usePlanHistory's, which sets the names here as it changes and
 * the two ways back; a keyboard's Cmd-Z and Shift-Cmd-Z do the same.
 */
export const usePlanUndo = create<{
  /** What Undo puts back ("Altitude"), or null with nothing to undo. */
  undoName: string | null;
  redoName: string | null;
  undo: () => void;
  redo: () => void;
}>(() => ({ undoName: null, redoName: null, undo: () => {}, redo: () => {} }));
