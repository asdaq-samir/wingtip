/**
 * How "When should I go?" writes its hours (the planner's app.window
 * answers them; the engine's departure_window judges them): each hour's
 * clock time on the device's own clock with its zone, the best window in
 * a line, an hour's verdict as the Brief's finding marks draw it, and its
 * time and fuel -- or, with no airplane picked, that they need one.
 */
import { duration } from "../../lib/format";
import type { Finding } from "../../lib/findings";
import type { DepartureWindowRun, WindowHour } from "../../lib/api/types";

/** An hour's verdict as the finding its mark and colour are drawn with
 *  (components/FindingIcon: a shape for each, not colour alone). */
export const HOUR_FINDING: Record<WindowHour["verdict"], Finding> = {
  go: "ok",
  caution: "caution",
  "no-go": "stop",
  unknown: "unknown",
};

/** What each verdict is called, for the hour's own line and its label. */
export const HOUR_WORD: Record<WindowHour["verdict"], string> = {
  go: "Go",
  caution: "Caution",
  "no-go": "No-go",
  unknown: "Not known",
};

const clockFormat = (timeZone?: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });

/** An instant's clock time, "07:00". */
export function clock(iso: string, timeZone?: string): string {
  return clockFormat(timeZone).format(new Date(iso));
}

/** The zone a time is written in, "CST", as the device names it. */
function zoneName(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone }).formatToParts(new Date(iso));
  return parts.find(p => p.type === "timeZoneName")?.value ?? "";
}

/** The weekday an hour falls on where it is not today's, "Tue": a strip
 *  of a day and a half crosses midnight once. */
export function dayOf(iso: string, now: Date, timeZone?: string): string | null {
  const day = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(d);
  const date = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const at = new Date(iso);
  return date(at) === date(now) ? null : day(at);
}

/** The best window in a line: "Best: 07:00–10:00 CST", its first and last
 *  departure hours; one hour alone, "Best: 07:00 CST"; a day not today
 *  named, "Best: Tue 07:00–10:00 CST". */
export function bestLine(w: DepartureWindowRun, now: Date, timeZone?: string): string {
  const day = dayOf(w.start, now, timeZone);
  const span = w.hours > 1 ? `${clock(w.start, timeZone)}–${clock(w.last, timeZone)}` : clock(w.start, timeZone);
  return `Best: ${day ? `${day} ` : ""}${span} ${zoneName(w.start, timeZone)}`.trimEnd();
}

/** An hour's time and fuel, "ETE 58m · 11.6 gal"; with no airplane picked,
 *  that they need one (the owner, 2026-11-08: "don't assume"). */
export function hourFigures(h: WindowHour, airplane: boolean): string {
  if (!airplane) return "ETE and fuel need an airplane";
  const parts = [h.ete_min != null ? `ETE ${duration(h.ete_min)}` : null, h.fuel_gal != null ? `${h.fuel_gal.toFixed(1)} gal` : null];
  return parts.filter(Boolean).join(" · ") || "No time or fuel worked out";
}

/** An hour's label for a screen reader: its time, its verdict and why. */
export function hourLabel(h: WindowHour, timeZone?: string): string {
  const why = h.reasons[0]?.detail;
  return `${clock(h.depart, timeZone)}: ${HOUR_WORD[h.verdict]}${h.night ? ", at night" : ""}${why ? `. ${why}` : ""}`;
}
