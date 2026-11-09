import { useEffect } from "react";

/**
 * Says a line to a screen reader (VoiceOver, TalkBack, NVDA) without
 * moving its focus: the web's UIAccessibility.post(.announcement) and
 * Android's announceForAccessibility, which the phones use for the same
 * alerts. Two live regions kept in the page from the start, one polite
 * and one assertive, as a region added with its words already in it is
 * not read by every reader (VoiceOver on iOS reads none of a role="status"
 * that arrives whole), and a banner whose countdown changes every few
 * seconds read as a live region is said again at each change. So the
 * alerts ahead, the copilot's message, a call from ATC and the emergency's
 * best field are each said here once, when new.
 */

type Politeness = "polite" | "assertive";

const regions: Partial<Record<Politeness, HTMLElement>> = {};

function region(politeness: Politeness): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const kept = regions[politeness];
  if (kept?.isConnected) return kept;
  const el = document.createElement("div");
  el.setAttribute("aria-live", politeness);
  el.setAttribute("aria-atomic", "true");
  // role=alert for the assertive one, so readers that go by role say it at once.
  el.setAttribute("role", politeness === "assertive" ? "alert" : "status");
  el.dataset.announcer = politeness;
  // Tailwind's sr-only, written out: this lives outside React's tree.
  Object.assign(el.style, {
    position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px",
    overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0",
  });
  document.body.appendChild(el);
  regions[politeness] = el;
  return el;
}

/** Makes both regions now, before anything is said, so the first line is
 *  heard: a reader watches a region it has already met. */
export function prepareAnnouncer() {
  region("polite");
  region("assertive");
}

/** Says `words` once. The region is emptied and filled on the next frame,
 *  so the same words said again are heard again. */
export function announce(words: string, politeness: Politeness = "polite") {
  const el = region(politeness);
  if (!el || !words) return;
  el.textContent = "";
  window.setTimeout(() => { el.textContent = words; }, 50);
}

/** Says `words` whenever they change to a new line (not when they go). */
export function useAnnounce(words: string | null | undefined, politeness: Politeness = "polite") {
  useEffect(() => { prepareAnnouncer(); }, []);
  useEffect(() => {
    if (words) announce(words, politeness);
  }, [words, politeness]);
}
