import { create } from "zustand";

/**
 * The ATC copilot's latest call to us, as one line, and what the pilot
 * set from it: published by features/atc and read by the in-flight
 * copilot's banner (features/copilot), so neither reaches into the other.
 * The banner shows the line once the call's own card is put away, as a
 * reminder of the last altitude, heading and frequency given. Kept while
 * the page is; nothing is sent or saved.
 */
interface LatestAtcCall {
  /** The call's one line ("Descend 3,000 ft · Left heading 270"), null
   *  before the first. */
  line: string | null;
  /** When it was heard, ms. */
  at: number | null;
  /** Its card is on the map; the banner leaves the line to it. */
  cardShown: boolean;
  /** What the pilot set from a call with a tap, to have in sight: the
   *  next frequency and its facility, the code. Never set by itself. */
  frequency: string | null;
  facility: string | null;
  squawk: string | null;
}

export const useLatestAtcCall = create<LatestAtcCall>(() => ({
  line: null,
  at: null,
  cardShown: false,
  frequency: null,
  facility: null,
  squawk: null,
}));

/** How long after it was heard the banner keeps the line, ms: past the
 *  next few calls a reminder is no longer the latest. */
export const LATEST_KEPT_MS = 10 * 60_000;
