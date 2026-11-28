import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fieldNotamsQuery, type FieldNotams } from "../../lib/queryClient";
import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import { formatIn, instantOf, twoFigures } from "../../lib/format";

// The field's NOTAMs and their query are lib/queryClient's, which Keep
// for the Air asks for each of the route's fields too.
export type { FieldNotams };
export type FieldNotam = FieldNotams["notams"][number];
/** A NOTAM as the engine reads it for a pilot (notam_read). */
export type NotamReading = EngineAnswer<"notam_read">;
/** A NOTAM's own card as the engine reads it from its parts (notam_card). */
export type NotamCardReading = EngineAnswer<"notam_card">;
/** A TFR as the engine reads it for a pilot (tfr_read). */
export type TfrReading = EngineAnswer<"tfr_read">;
/** How many NOTAMs the card's section shows, the engine's first three
 *  (its ranking says its top three first, notams_ranked), the title the
 *  way to the rest, as every list on the card shows three (FirstFew). */
const FIRST = 3;

/**
 * The airport card's NOTAMs, its view model: the field's NOTAMs in the
 * engine's order (those in force first, then best first: notams_ranked),
 * the first three or all of them, opened and closed again in place by the
 * section's title as every section on the card is (FirstFew; the owner,
 * 2026-11-11: "Notams should open like other sections"). It has no filter
 * of its own (the owner, 2026-11-13: "I don't want search notams").
 */
export function useFieldNotams(ident: string) {
  const query = useQuery(fieldNotamsQuery(ident));
  const { data, isError, dataUpdatedAt, errorUpdatedAt } = query;
  const [all, setAll] = useState(false);
  const notams = data?.notams ?? [];
  const long = notams.length > FIRST;
  return {
    data,
    isError,
    /** The query itself, for the list's Try again where it failed (QueryState). */
    query,
    // When the list came, and whether asking again since failed: its age
    // where it is the one kept (PlaceNotamsSection's KeptAge).
    atMs: dataUpdatedAt || null,
    failed: errorUpdatedAt > dataUpdatedAt,
    total: notams.length,
    shown: all || !long ? notams : notams.slice(0, FIRST),
    long,
    all,
    toggle: () => setAll(!all),
  };
}

/** The field's time zone, the planner's (wingtip.time_zone), from the
 *  query the list reads; null until it is had or where none is known. */
export function useFieldZone(ident: string): string | null {
  return useQuery(fieldNotamsQuery(ident)).data?.time_zone ?? null;
}

/** The field's idents as a NOTAM may write them ("OSH", "KOSH"), kept as
 *  written in its words: the engine's field_names (FAA JO 7350.9GG 4-1). */
export function identsOf(ident: string): string[] {
  return callEngine("field_names", { ident });
}

/** The NOTAM as the engine read it on the planner (notam_read, the
 *  NOTAM's `reading`, app.notam_reading): its heading, its words written
 *  out, its window. */
export function readNotam(n: FieldNotam): NotamReading {
  return n.reading as unknown as NotamReading;
}

/** The NOTAM's card as the engine read it on the planner from its parts
 *  (notam_card, the NOTAM's `card`): what happened, its category, one
 *  sentence of its effect, the procedures it takes away, whether it is
 *  permanent and so runs until the charts are updated. */
export function cardOf(n: FieldNotam): NotamCardReading {
  return n.card as unknown as NotamCardReading;
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
    // Areas some AGL, some MSL: the band says its one figure isn't the
    // whole TFR's (round 7's N17).
    floor_varies: t?.floor_varies ?? false,
    ceiling_varies: t?.ceiling_varies ?? false,
    over_field: t?.over_field,
    field: t?.field,
    edge: t?.edge,
  });
}

/** A NOTAM's first line: what happened in our words ("Runway 04L/22R
 *  closed except taxiing"), the engine's (notam_card's title: notam_read's
 *  what, else what its parts say, "Runway 18/36 closed" of a SID
 *  NOTAM), else its words written out, said once, not under a title that
 *  repeats their start (the owner, 2026-11-11: "avoid redundant
 *  information"); a TFR's kind and rule ("Security TFR, 14 CFR 99.7",
 *  tfr_read). */
export function whatOf(n: FieldNotam): string {
  if (n.kind === "tfr") return readTfr(n).what;
  return cardOf(n).title ?? readNotam(n).words;
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
export function headingOf(n: FieldNotam): string {
  if (n.kind === "tfr") return readTfr(n).heading;
  return readNotam(n).heading ?? "NOTAM";
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
  const at = instantOf(iso);
  return at === null ? null : new Date(at);
}

/** The feed's times, or where it gave none the NOTAM's own (its
 *  YYMMDDHHMM-YYMMDDHHMM, read by the engine). */
export function windowOf(n: FieldNotam, read: NotamReading): Pick<FieldNotam, "in_force" | "starts" | "ends"> {
  return { in_force: n.in_force, starts: n.starts ?? read.starts, ends: n.ends ?? read.ends };
}

const CORNER = {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  year: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
} as const;

const utcDay = (at: Date, year: boolean) =>
  `${twoFigures(at.getUTCMonth() + 1)}/${twoFigures(at.getUTCDate())}${year ? `/${twoFigures(at.getUTCFullYear() % 100)}` : ""}`;

/** "11/10 06:00 CST": month/day and the 24-hour clock in the field's own
 *  time zone (the planner's, `zone`), named by its short name as a pilot
 *  says it, "CST" at O'Hare (the owner, 2026-11-23: "no need to say the
 *  word local or Z time, just say the time zone"). Where the field's zone
 *  is not known, the same in UTC, said so ("11/10 12:00 UTC"): never the
 *  device's own time called the field's. With `year`, the year's two
 *  figures after the day ("05/27/28"), as the app says a year that is not
 *  this one (tfrTimes; the owner, 2026-11-23). */
export function corner(at: Date, zone: string | null, year = false): string {
  const format = zone ? formatIn(zone, CORNER) : null;
  if (!format) return `${utcDay(at, year)} ${twoFigures(at.getUTCHours())}:${twoFigures(at.getUTCMinutes())} UTC`;
  const part = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
  return `${part.month}/${part.day}${year ? `/${part.year}` : ""} ${part.hour}:${part.minute} ${part.timeZoneName}`;
}
