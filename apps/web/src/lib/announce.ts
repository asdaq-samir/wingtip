import { useEffect } from "react";
import { announce } from "@react-aria/live-announcer";

/**
 * Says a line to a screen reader (VoiceOver, TalkBack, NVDA) without
 * moving its focus -- the web's UIAccessibility.post(.announcement) and
 * Android's announceForAccessibility, which the phones use for the same
 * alerts -- through React Aria's live announcer (`announce`, called
 * straight where a line is said once): its two logs, polite and
 * assertive, are put in the page before the first line goes in them, as
 * a region added with its words already in it is not read by every
 * reader (VoiceOver on iOS reads none of a role="status" that arrives
 * whole), and a banner whose countdown changes every few seconds read as
 * a live region is said again at each change. So the alerts ahead, the
 * copilot's message, a call from ATC and the emergency's best field are
 * each said through it once, when new.
 */

/** Says `words` whenever they change to a new line (not when they go). */
export function useAnnounce(words: string | null | undefined, politeness: "polite" | "assertive" = "polite") {
  useEffect(() => {
    if (words) announce(words, politeness);
  }, [words, politeness]);
}
