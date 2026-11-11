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
 * first, the first three for the section, and whether the list in full is
 * open over the card (the owner, 2026-11-11: "Can notams also show as a
 * list of three like others").
 */
export function useFieldNotams(ident: string) {
  const { data, isError } = useQuery(fieldNotamsQuery(ident));
  const [listOpen, setListOpen] = useState(false);
  const notams = data?.notams ?? [];
  return {
    data,
    isError,
    notams,
    first: notams.slice(0, FIRST),
    more: notams.length > FIRST,
    listOpen,
    openList: () => setListOpen(true),
    closeList: () => setListOpen(false),
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
 *  what), else its title. */
export function whatOf(n: FieldNotam, ident: string): string {
  return (n.kind !== "tfr" && readNotam(n, ident).what) || headingOf(n, ident);
}

/** A NOTAM's title: the thing it is about where its words name it
 *  ("Runway 06/24", "Taxiway A", "Fuel 100LL"), else its keyword as a
 *  heading, both the engine's (notam_read); "TFR" for a TFR. The owner,
 *  2026-11-11: "the notam title can be a bit more specific". */
export function headingOf(n: FieldNotam, ident: string): string {
  if (n.kind === "tfr") return "TFR";
  const read = readNotam(n, ident);
  return read.title ?? read.heading ?? "NOTAM";
}

/** A feed's time as a date, one with no zone read as UTC; null where it
 *  is none. */
function dateOf(iso: string | null | undefined): Date | null {
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
function corner(at: Date, local: boolean): string {
  const part = Object.fromEntries(CORNER.formatToParts(at).map((p) => [p.type, p.value]));
  return `${part.month}/${part.day} ${part.hour}:${part.minute}${local ? " local" : ""}`;
}

/** Its start and end for a row's corner in the device's own time, month/day
 *  and 24 hours, "local" once on the last ("11/10 06:00" over
 *  "11/12 08:32 local"; the owner, 2026-11-11: "Instead of Zulu time make it
 *  local time", then the numeric 24-hour form for "How can we make the
 *  notam date time more compact"; its full card keeps the UTC the NOTAM
 *  gives): the end an estimate with "(est.)", not EST (Eastern time),
 *  "Permanent" where it is PERM
 *  (JO 7930.2 4-2-1), null where none is given. */
function cornerOf(n: FieldNotam, read: NotamReading): { from: string | null; until: string | null } {
  const window = windowOf(n, read);
  const [starts, ends] = [dateOf(window.starts), dateOf(window.ends)];
  const until = ends ? `${corner(ends, true)}${read.estimated ? " (est.)" : ""}` : read.permanent ? "Permanent" : null;
  return { from: starts ? corner(starts, !ends) : null, until };
}

/** Its window on one line in the device's own time, as the corner said it:
 *  "11/10 06:00 – 11/12 08:32 local", "Until 11/12 08:32 local",
 *  "Permanent" (the owner, 2026-11-11: "title(what), when, where, why ...
 *  on different lines"); null where none is given. */
export function whenLine(n: FieldNotam, read: NotamReading): string | null {
  const { from, until } = cornerOf(n, read);
  if (from && until) return `${from} – ${until}`;
  if (until) return until === "Permanent" ? until : `Until ${until}`;
  return from ? `From ${from}` : null;
}

const LOCAL = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The window in the device's own time, said to be local, its zone not
 *  named ("Nov 12, 3:00 – 11:00 AM local"), beside the UTC the NOTAM gives (JO 7930.2 3-3-2). */
export function localWords(starts: string | null | undefined, ends: string | null | undefined): string | null {
  const [from, until] = [dateOf(starts), dateOf(ends)];
  if (from && until) return `${LOCAL.formatRange(from, until)} local`;
  if (from) return `From ${LOCAL.format(from)} local`;
  return until ? `Until ${LOCAL.format(until)} local` : null;
}
