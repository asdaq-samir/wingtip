/**
 * How "When should I go?" writes its hours (the planner's app.window
 * answers them; the engine's departure_window judges them): each hour's
 * clock time on the device's own clock with its zone (lib/format's), the best window in
 * a line, an hour's verdict as the Brief's finding marks draw it, and its
 * time and fuel -- or, with no airplane picked, that they need one.
 */
import { clockTime, duration, localDay, zoneName } from "../../lib/format";
import type { Finding } from "../../lib/findings";
import type { DepartureWindowRun, WindowHour } from "../../lib/api/types";

/** An hour's verdict as the finding its mark and colour are drawn with
 *  (components/FindingIcon: a shape for each, not colour alone). */
export const HOUR_FINDING: Record<WindowHour["verdict"], Finding> = { go: "ok", caution: "caution", "no-go": "stop", unknown: "unknown" };

/** What each verdict is called, for the hour's own line and its label. */
export const HOUR_WORD: Record<WindowHour["verdict"], string> = { go: "Go", caution: "Caution", "no-go": "No-go", unknown: "Not known" };

/** An instant's clock time on this device's clock, "07:00". */
export const clock = (iso: string): string => clockTime(new Date(iso));

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The weekday an hour falls on where it is not today's, "Tue": a strip
 *  of a day and a half crosses midnight once. */
export function dayOf(iso: string, now: Date): string | null {
  const at = new Date(iso);
  return localDay(at) === localDay(now) ? null : WEEKDAYS[at.getDay()]!;
}

/** The best window in a line: "Best: 07:00–10:00 CST", its first and last
 *  departure hours; one hour alone, "Best: 07:00 CST"; a day not today
 *  named, "Best: Tue 07:00–10:00 CST". */
export function bestLine(w: DepartureWindowRun, now: Date): string {
  const day = dayOf(w.start, now);
  const span = w.hours > 1 ? `${clock(w.start)}–${clock(w.last)}` : clock(w.start);
  return `Best: ${day ? `${day} ` : ""}${span} ${zoneName(new Date(w.start))}`.trimEnd();
}

/** An hour's time and fuel, "ETE 58m · 11.6 gal"; with no airplane picked,
 *  that they need one (the owner, 2026-11-08: "don't assume"). */
export function hourFigures(h: WindowHour, airplane: boolean): string {
  if (!airplane) return "ETE and fuel need an airplane";
  const parts = [h.ete_min != null ? `ETE ${duration(h.ete_min)}` : null, h.fuel_gal != null ? `${h.fuel_gal.toFixed(1)} gal` : null];
  return parts.filter(Boolean).join(" · ") || "No time or fuel worked out";
}

/** An hour's label for a screen reader: its time, its verdict and why. */
export function hourLabel(h: WindowHour): string {
  const why = h.reasons[0]?.detail;
  return `${clock(h.depart)}: ${HOUR_WORD[h.verdict]}${h.night ? ", at night" : ""}${why ? `. ${why}` : ""}`;
}
