import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { data, planner } from "../../../../lib/api/client";
import type { components } from "../../../../lib/api/schema";
import { callEngine, type EngineAnswer } from "../../../../lib/engine/engine";

export type FieldNotams = components["schemas"]["NotamsRanked"];
export type FieldNotam = FieldNotams["notams"][number];
/** A NOTAM as the engine reads it for a pilot (notam_read). */
export type NotamReading = EngineAnswer<"notam_read">;

/**
 * A field's own NOTAMs (the FAA's feed, by any ident it goes by) and the
 * TFRs within 5 nm of it, best first, as the engine ranks a route's: the
 * planner's GET /api/airport/{ident}/notams, which the iPhone's and
 * Android's cards read too. 14 CFR 91.103 asks for the NOTAMs of every
 * field a flight uses; a card is where a pilot looks at one field.
 */
export const fieldNotamsQuery = (ident: string) =>
  queryOptions({
    queryKey: ["airport-notams", ident],
    queryFn: () => planner.GET("/api/airport/{ident}/notams", { params: { path: { ident } } }).then(data<FieldNotams>),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

/** How many NOTAMs the card's section shows, the engine's first three
 *  (its ranking says its top three first, notams_ranked), the title the
 *  way to the rest, as every list on the card shows three (FirstFew). */
const FIRST = 3;

/**
 * The airport card's NOTAMs, its view model: the field's NOTAMs best
 * first, the first three or all of them, opened and closed again in place
 * by the section's title as every section on the card is (FirstFew; the
 * owner, 2026-11-11: "Notams should open like other sections").
 */
export function useFieldNotams(ident: string) {
  const { data, isError } = useQuery(fieldNotamsQuery(ident));
  const [all, setAll] = useState(false);
  const notams = data?.notams ?? [];
  const long = notams.length > FIRST;
  return {
    data,
    isError,
    total: notams.length,
    shown: all || !long ? notams : notams.slice(0, FIRST),
    long,
    all,
    toggle: () => setAll(!all),
  };
}

/** The field's idents as a NOTAM may write them ("OSH", "KOSH"), kept as
 *  written in its words. */
export function identsOf(ident: string): string[] {
  const bare = ident.length === 4 && ident.startsWith("K") ? ident.slice(1) : ident;
  return [...new Set([ident, bare, `K${bare}`])];
}

/** The NOTAM read by the engine (notam_read): its heading, its words
 *  written out, its window. Drawn inside an EngineGate. */
export function readNotam(n: FieldNotam, ident: string): NotamReading {
  return callEngine("notam_read", { text: n.raw, idents: identsOf(ident) });
}

/** A NOTAM's first line: what it is and its condition in our words
 *  ("Runway 04L/22R closed except taxiing"), the engine's (notam_read's
 *  what), else its words written out, said once, not under a title that
 *  repeats their start (the owner, 2026-11-11: "avoid redundant
 *  information"); "TFR" for a TFR, its words under it. */
export function whatOf(n: FieldNotam, ident: string): string {
  if (n.kind === "tfr") return "TFR";
  const read = readNotam(n, ident);
  return read.what ?? read.words;
}

/** The heading of a NOTAM's own card: what kind it is ("Runway",
 *  "Obstacle", the engine's heading; "TFR"), its first line under it
 *  saying which. */
export function headingOf(n: FieldNotam, ident: string): string {
  if (n.kind === "tfr") return "TFR";
  return readNotam(n, ident).heading ?? "NOTAM";
}

/** Its number as a briefer reads it, the field's own name off it on the
 *  field's card ("11/060", not "ORD 11/060"); another place's kept. */
export function numberOf(n: FieldNotam, ident: string): string {
  const own = identsOf(ident).find((i) => n.id.startsWith(`${i} `));
  return own ? n.id.slice(own.length + 1) : n.id;
}

/** A feed's time as a date, one with no zone read as UTC; null where it
 *  is none. */
export function dateOf(iso: string | null | undefined): Date | null {
  const at = iso ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** "Nov 12 1432Z": a NOTAM's time in UTC with its day, as the FAA's
 *  NOTAMs give their times (AIM 5-1-3); a feed time with no zone is UTC. */
export function zulu(iso: string): string {
  const at = dateOf(iso);
  if (!at) return iso;
  const month = at.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const hhmm = `${String(at.getUTCHours()).padStart(2, "0")}${String(at.getUTCMinutes()).padStart(2, "0")}Z`;
  return `${month} ${at.getUTCDate()} ${hhmm}`;
}

/** When it is in force, in words: "In effect now, until Nov 12 1432Z",
 *  "From Nov 12 1200Z", or nothing where the feed gives no times. An end
 *  sent with EST is an estimate, and PERM is permanent (FAA JO 7930.2
 *  4-2-1), as the engine reads them from the text (notam_read). */
export function whenWords(
  n: Pick<FieldNotam, "in_force" | "starts" | "ends">,
  read?: Pick<NotamReading, "estimated" | "permanent">,
): string | null {
  const est = read?.estimated ? " (estimated)" : "";
  const until = n.ends ? `until ${zulu(n.ends)}${est}` : read?.permanent ? "permanent" : null;
  if (n.in_force) return until ? `In effect now, ${until}` : "In effect now";
  if (n.starts) return `From ${zulu(n.starts)}${until ? `${n.ends ? " " : ", "}${until}` : ""}`;
  return until ? `In effect ${until}` : null;
}

/** The feed's times, or where it gave none the NOTAM's own (its
 *  YYMMDDHHMM-YYMMDDHHMM, read by the engine). */
export function windowOf(n: FieldNotam, read: NotamReading): Pick<FieldNotam, "in_force" | "starts" | "ends"> {
  return { in_force: n.in_force, starts: n.starts ?? read.starts, ends: n.ends ?? read.ends };
}

const CORNER = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "11/10 06:00", with " local" where `local`: month/day and the 24-hour
 *  clock in the device's own time, as a pilot writes it on a kneeboard,
 *  the zone not named (the owner, 2026-11-11: "No need to mention time
 *  zone, just say local"). */
export function corner(at: Date, local: boolean): string {
  const part = Object.fromEntries(CORNER.formatToParts(at).map((p) => [p.type, p.value]));
  return `${part.month}/${part.day} ${part.hour}:${part.minute}${local ? " local" : ""}`;
}
