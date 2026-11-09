/**
 * What was read off a photographed page, as the review screens change
 * it: a figure corrected at its path, the page cut to the items the pilot
 * confirmed, and the engine asked again each time (handbook_read_check,
 * logbook_read_check, the same rules the assistant asked, through
 * lib/engine). The engine's answer is what the screens show and what is
 * saved; nothing is worked out here.
 */
import type { DocumentRead, HandbookFigures } from "../../lib/api/types";
import { callEngine, type EngineAnswer, type EngineInput } from "../../lib/engine/engine";

export type HandbookRead = EngineInput<"handbook_read_check">;
export type HandbookCheck = EngineAnswer<"handbook_read_check">;
export type HandbookItem = HandbookCheck["items"][number];
export type LogbookRead = EngineInput<"logbook_read_check">;
export type LogbookCheck = EngineAnswer<"logbook_read_check">;
type LogbookEntryDraft = LogbookCheck["rows"][number]["entry"];

/** The server's read as the engine's input: the same members, the
 *  assistant's model and the contract each typing it their own way. */
export const handbookOf = (read: DocumentRead): HandbookRead | null => (read.handbook as HandbookRead | null) ?? null;
export const logbookOf = (read: DocumentRead): LogbookRead | null => (read.logbook as LogbookRead | null) ?? null;

export const checkHandbook = (read: HandbookRead): HandbookCheck => callEngine("handbook_read_check", read);
export const checkLogbook = (read: LogbookRead, today: string): LogbookCheck => callEngine("logbook_read_check", { ...read, today });

/** The read with the figure at `path` ("cruise.2.tas", "empty.weight",
 *  "max_takeoff_weight") set to `value`; the read itself unchanged. */
export function withFigure<T extends object>(read: T, path: string, value: number | string | null): T {
  const copy = structuredClone(read) as Record<string, unknown>;
  const parts = path.split(".");
  let at: Record<string, unknown> = copy;
  for (const part of parts.slice(0, -1)) {
    const next = at[part];
    if (next === null || typeof next !== "object") at[part] = {};
    at = at[part] as Record<string, unknown>;
  }
  at[parts[parts.length - 1] as string] = value;
  return copy as T;
}

const TABLES = ["cruise", "takeoff", "landing"] as const;
const GROUPS = ["climb", "glide", "empty", "fuel"] as const;

/** The read with only the confirmed items (by their keys, "cruise.2",
 *  "climb", "weight", "envelope"): a table's rows not confirmed dropped,
 *  a group not confirmed none, so asking the engine again gives only what
 *  the pilot saw and kept. */
export function confirmedHandbook(read: HandbookRead, confirmed: ReadonlySet<string>): HandbookRead {
  const kept: HandbookRead = { ...read };
  for (const table of TABLES) kept[table] = (read[table] ?? []).filter((_, i) => confirmed.has(`${table}.${i}`));
  for (const group of GROUPS) if (!confirmed.has(group)) kept[group] = null;
  if (!confirmed.has("weight")) kept.max_takeoff_weight = null;
  if (!confirmed.has("envelope")) kept.envelope = [];
  return kept;
}

/** The confirmed items' figures, in the app's units, and the airplane
 *  form's from them: the engine asked again with only those items. */
export function confirmedFigures(read: HandbookRead, confirmed: ReadonlySet<string>): { handbook: HandbookFigures; profile: HandbookCheck["profile"] } {
  const { handbook, profile } = checkHandbook(confirmedHandbook(read, confirmed));
  // The contract's HandbookFigures, which the gateway keeps as its own
  // record of the same members.
  return { handbook: handbook as HandbookFigures, profile };
}

/** The figures kept so far (an earlier page's, or the airplane's saved
 *  ones) with a new page's over them: a table or a figure the new page
 *  gave replaces the old, and what it did not give stays -- a
 *  performance page and then a weight and balance page make one record. */
export function mergeHandbook(base: HandbookFigures | null | undefined, next: HandbookFigures): HandbookFigures {
  if (!base) return next;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const given = Array.isArray(value) ? value.length > 0 : value != null;
    if (given) merged[key] = value;
  }
  return merged as HandbookFigures;
}

/** Whether a logbook row can be logged: it has the date the gateway
 *  needs (14 CFR 61.51(b)(1)(i)). */
export const loggable = (entry: LogbookEntryDraft): boolean => !!entry.flownOn;

/** A figure as the review writes it: to a tenth, whole where it is. */
export const tenth = (v: number): string => (Math.round(v * 10) / 10).toString();
