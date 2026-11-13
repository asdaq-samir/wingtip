import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { data, planner } from "../../../../lib/api/client";
import type { components } from "../../../../lib/api/schema";
import { callEngine, type EngineAnswer } from "../../../../lib/engine/engine";
import { twoFigures, zuluTime } from "../../../../lib/format";

export type FieldNotams = components["schemas"]["NotamsRanked"];
export type FieldNotam = FieldNotams["notams"][number];
/** A NOTAM as the engine reads it for a pilot (notam_read). */
export type NotamReading = EngineAnswer<"notam_read">;
/** A TFR as the engine reads it for a pilot (tfr_read). */
export type TfrReading = EngineAnswer<"tfr_read">;

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
 * The airport card's NOTAMs, its view model: the field's NOTAMs in the
 * engine's order (those in force first, then best first: notams_ranked),
 * the first three or all of them, opened and closed again in place by the
 * section's title as every section on the card is (FirstFew; the owner,
 * 2026-11-11: "Notams should open like other sections"); and what is typed
 * in the list's filter, every NOTAM that says it shown while it is there
 * (the owner, 2026-11-12: a search field in the NOTAM list). Filtering
 * asks the engine (notam_read), so this is used inside the card's
 * EngineGate.
 */
export function useFieldNotams(ident: string) {
  const { data, isError } = useQuery(fieldNotamsQuery(ident));
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const notams = data?.notams ?? [];
  const long = notams.length > FIRST;
  const typed = query.trim();
  return {
    data,
    isError,
    total: notams.length,
    shown: typed ? notams.filter((n) => saysIt(n, ident, typed)) : all || !long ? notams : notams.slice(0, FIRST),
    long,
    all,
    toggle: () => setAll(!all),
    query,
    setQuery,
  };
}

/** The field's time zone, the planner's (wingtip.time_zone), from the
 *  query the list reads; null until it is had or where none is known. */
export function useFieldZone(ident: string): string | null {
  return useQuery(fieldNotamsQuery(ident)).data?.time_zone ?? null;
}

/** Whether a NOTAM says what is typed, in any of the words a pilot sees of
 *  it: its first line, its kind, its number, its words written out and its
 *  text as sent, case aside. */
function saysIt(n: FieldNotam, ident: string, typed: string): boolean {
  const read = n.kind === "tfr" ? null : readNotam(n, ident);
  const words = [whatOf(n, ident), headingOf(n, ident), n.id, read?.words, n.raw];
  const want = typed.toLowerCase();
  return words.some((w) => w?.toLowerCase().includes(want));
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

/** A TFR read by the engine (tfr_read) from what tfr.faa.gov gives of it
 *  (the planner's `tfr`): its kind as a heading, its kind and rule, how
 *  high it reaches and where it is from the field, its place's name. */
export function readTfr(n: FieldNotam): TfrReading {
  const t = n.tfr;
  return callEngine("tfr_read", {
    kind: t?.kind,
    rule: t?.rule,
    title: t?.title,
    floor_ft: t?.floor_ft,
    floor_ref: t?.floor_ref,
    ceiling_ft: t?.ceiling_ft,
    ceiling_ref: t?.ceiling_ref,
    over_field: t?.over_field,
    field: t?.field,
    edge: t?.edge,
  });
}

/** A NOTAM's first line: what it is and its condition in our words
 *  ("Runway 04L/22R closed except taxiing"), the engine's (notam_read's
 *  what), else its words written out, said once, not under a title that
 *  repeats their start (the owner, 2026-11-11: "avoid redundant
 *  information"); a TFR's kind and rule ("Security TFR, 14 CFR 99.7",
 *  tfr_read). */
export function whatOf(n: FieldNotam, ident: string): string {
  if (n.kind === "tfr") return readTfr(n).what;
  const read = readNotam(n, ident);
  return read.what ?? read.words;
}

/** Where it is, the engine's, only where that is not obvious: a NOTAM's
 *  place off the field (notam_read), a TFR's levels and where it is from
 *  the field (tfr_read). */
export function whereOf(n: FieldNotam, read: NotamReading): string | null {
  return n.kind === "tfr" ? readTfr(n).where : read.where;
}

/** The heading of a NOTAM's own card: what kind it is ("Runway",
 *  "Obstacle", the engine's heading; a TFR's kind, "Security TFR"), its
 *  first line under it saying which, so "TFR" is said once (the owner,
 *  2026-11-12). */
export function headingOf(n: FieldNotam, ident: string): string {
  if (n.kind === "tfr") return readTfr(n).heading;
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

/** The feed's times, or where it gave none the NOTAM's own (its
 *  YYMMDDHHMM-YYMMDDHHMM, read by the engine). */
export function windowOf(n: FieldNotam, read: NotamReading): Pick<FieldNotam, "in_force" | "starts" | "ends"> {
  return { in_force: n.in_force, starts: n.starts ?? read.starts, ends: n.ends ?? read.ends };
}

/** One formatter per zone, made the first time it is asked for: an Intl
 *  formatter is costly to make (lib/format/time's note). Null where the
 *  browser does not know the zone. */
const corners = new Map<string, Intl.DateTimeFormat | null>();
function cornerIn(zone: string): Intl.DateTimeFormat | null {
  if (!corners.has(zone)) {
    let format: Intl.DateTimeFormat | null = null;
    try {
      format = new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: zone,
      });
    } catch {
      // RangeError: a zone this browser's time-zone data does not have.
    }
    corners.set(zone, format);
  }
  return corners.get(zone) ?? null;
}

const utcDay = (at: Date) => `${twoFigures(at.getUTCMonth() + 1)}/${twoFigures(at.getUTCDate())}`;

/** "11/10 06:00 (1200Z)", with " local" where `local`: month/day and the
 *  24-hour clock in the field's own time zone (the planner's, `zone`), as
 *  a pilot writes it on a kneeboard, the zone not named (the owner,
 *  2026-11-11: "No need to mention time zone, just say local"), and UTC
 *  beside it, the time the NOTAM gives (FAA JO 7930.2 3-3-2; the owner,
 *  2026-11-12: "airport's local time with UTC beside"). Where the field's
 *  zone is not known, UTC alone with its day ("11/10 1200Z"): never the
 *  device's own time called the field's. */
export function corner(at: Date, zone: string | null, local: boolean): string {
  const format = zone ? cornerIn(zone) : null;
  if (!format) return `${utcDay(at)} ${zuluTime(at)}`;
  const part = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
  return `${part.month}/${part.day} ${part.hour}:${part.minute}${local ? " local" : ""} (${zuluTime(at)})`;
}
