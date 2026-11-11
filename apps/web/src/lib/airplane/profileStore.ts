import { create } from "zustand";
import type { FigureKey } from "./figures";

/**
 * Which airplane's profile is open over the page, and the figure it opens
 * on: any N-number the app shows opens it (the owner, 2026-11-09: "tapping
 * any N-number opens that airplane's profile"), and every airplane figure
 * on its figure. One place any screen opens it from, as the emergency
 * assistant's (lib/emergencyStore); features/airplane draws it. Closing it
 * only shuts it, so the pilot is back where they were.
 *
 * And which asks the pilot put off this session ("Not now"), by the
 * N-number and the figure: kept until the page is loaded again.
 */
interface ProfileOpen {
  tail: string;
  focus: FigureKey | null;
}

export const useProfileOpen = create<{ open: ProfileOpen | null; notNow: string[] }>(() => ({ open: null, notNow: [] }));

export const openAirplaneProfile = (tail: string, focus: FigureKey | null = null) =>
  useProfileOpen.setState({ open: { tail: tail.toUpperCase(), focus } });

export const closeAirplaneProfile = () => useProfileOpen.setState({ open: null });

const notNowKey = (tail: string, key: string) => `${tail.toUpperCase()}:${key}`;

/** The ask for `key` of `tail` put off until the page is loaded again. */
export const putOff = (tail: string, key: string) =>
  useProfileOpen.setState((s) => ({ notNow: [...new Set([...s.notNow, notNowKey(tail, key)])] }));

export const isPutOff = (notNow: readonly string[], tail: string, key: string) => notNow.includes(notNowKey(tail, key));
