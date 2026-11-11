import { create } from "zustand";
import type { ScreenId } from "./generated/screens";

/** How long a screen asked for waits for what it needs (a route for the
 *  Brief), before it is let go: a link opened with no route must not open
 *  the Brief by itself when a route is planned an hour later. */
const WAIT_MS = 30_000;

/**
 * The one way into a screen or a field's card from anywhere: a link's
 * `open=` (useOpenScreen reads it off the address), a figure tapped (the
 * strip's Dist to the nav log), a name tapped (a nav log row's field to its
 * card). Whoever can open it takes it (useOpenScreen for a screen,
 * usePlaceCards for a field), so the asker needs to know nothing of the
 * panel, its tabs or Setup's pages: one place per platform holds how each
 * screen is opened, as docs/navigation.md asks.
 */
export const useWanted = create<{ screen: ScreenId | null; place: string | null; at: number }>(() => ({
  screen: null,
  place: null,
  at: 0,
}));

export const wantScreen = (screen: ScreenId) => useWanted.setState({ screen, at: Date.now() });
export const wantPlace = (place: string) => useWanted.setState({ place, at: Date.now() });

/** The screen asked for, taken once by whoever opens it. */
export function takeScreen(): ScreenId | null {
  const { screen, at } = useWanted.getState();
  useWanted.setState({ screen: null });
  return screen && Date.now() - at < WAIT_MS ? screen : null;
}

/** Whether the screen asked for has waited too long for what it needs. */
export const stale = () => Date.now() - useWanted.getState().at >= WAIT_MS;

export function takePlace(): string | null {
  const { place } = useWanted.getState();
  useWanted.setState({ place: null });
  return place;
}
