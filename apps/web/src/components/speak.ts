import { useEffect, useEffectEvent } from "react";
import type { AheadAlert } from "../lib/api/types";
import { usePreferences } from "../lib/preferences";
import { say } from "../lib/speech";
import { announce } from "@react-aria/live-announcer";
import { alertTitle, alertWhen, type Ahead } from "../lib/map/position/ahead";
import { grouped } from "../lib/format";

/**
 * The alerts ahead (lib/map/position/ahead) said aloud, at the pilot's ask, as a
 * cockpit's aural alerts are: the pilot's eyes are outside, and a phone
 * on a kneeboard is not looked at in time. Each is said once, as it
 * first comes ahead -- a warning before a caution, then the soonest, the
 * order the banner shows them -- and again only after it has gone from
 * ahead and comes back. An acknowledged one is not said. The words are
 * the banner's, as a voice reads them: "Chicago Class B, in 2 minutes";
 * "Tower, 2,700 feet, 300 feet below you, in 40 seconds".
 */

/** An alert's line, as said. */
export function spokenAlert(a: AheadAlert): string {
  const title = alertTitle(a)
    // A TFR's NOTAM number is read off the banner, not heard.
    .replace(/^TFR .*/, "TFR")
    .replace(/(\d) ft\b/g, "$1 feet");
  const when = alertWhen(a)
    .replace(/^In (\d+) s$/, "in $1 seconds")
    .replace(/^In 1 min$/, "in 1 minute")
    .replace(/^In (\d+) min$/, "in $1 minutes")
    .toLowerCase();
  const below = a.clearance_ft != null ? `${grouped(Math.abs(a.clearance_ft))} feet ${a.clearance_ft >= 0 ? "below" : "above"} you` : null;
  return [title, below, when].filter(Boolean).join(", ");
}

/** What to say of the alerts ahead now, and the ids then said: each not
 *  said before, the first in full and the rest as a count, and those
 *  gone from ahead forgotten, so met again they are said again. */
export function toSay(alerts: AheadAlert[], said: ReadonlySet<string>): { words: string | null; said: Set<string> } {
  const fresh = alerts.filter((a) => !said.has(a.id));
  const kept = new Set([...said].filter((id) => alerts.some((a) => a.id === id)));
  fresh.forEach((a) => kept.add(a.id));
  if (!fresh.length) return { words: null, said: kept };
  const more = fresh.length - 1;
  return { words: `${spokenAlert(fresh[0]!)}${more ? `, and ${more} more` : ""}.`, said: kept };
}

let said = new Set<string>();
let announced = new Set<string>();

/** Says each alert ahead as it comes, while the pilot has them spoken;
 *  and, with the voice off, tells a screen reader the same words once
 *  each (lib/announce), a warning at once and a caution as it can, as the
 *  banner's countdown is not a live region that would be read again at
 *  every change. */
export function useSpokenAlerts(ahead: Ahead | null) {
  const on = usePreferences((s) => s.speakAlerts);
  const alerts = ahead?.alerts;
  const key = alerts?.map((a) => a.id).join("|") ?? "";
  const speakAhead = useEffectEvent(() => {
    // On the ground, or looking at nothing: the next flight starts afresh.
    if (!alerts) {
      said = new Set();
      announced = new Set();
      return;
    }
    // The voice says it already; a reader would say it over the voice.
    if (!on) {
      const next = toSay(alerts, announced);
      announced = next.said;
      if (next.words) announce(next.words, alerts.some((a) => a.level === "warning") ? "assertive" : "polite");
      return;
    }
    // Turned on in the air, what is ahead then is said at once.
    const next = toSay(alerts, said);
    said = next.said;
    if (next.words) say(next.words);
  });
  // Keyed on which alerts are ahead, not on the array made each render.
  useEffect(() => speakAhead(), [key, on]);
}
