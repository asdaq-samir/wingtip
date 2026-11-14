import type { StateCreator } from "zustand";
import type { Preferences } from "../preferences";

/** A part of the one preferences store (lib/preferences), zustand's stock
 *  slice pattern under its persist middleware: each part made on its own,
 *  all of them one store under one storage key. */
export type Slice<T> = StateCreator<Preferences, [["zustand/persist", unknown]], [], T>;
