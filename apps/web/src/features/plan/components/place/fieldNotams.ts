import { queryOptions } from "@tanstack/react-query";
import { data, planner } from "../../../../lib/api/client";
import type { components } from "../../../../lib/api/schema";

export type FieldNotams = components["schemas"]["NotamsRanked"];
export type FieldNotam = FieldNotams["notams"][number];

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

/** How many alerts lead the card, as Maps' live cards do (the phones'). */
const ALERTS = 3;

/** What leads the card: each NOTAM the engine marks as closing the field
 *  or a runway, and each TFR near it, in the engine's order, at most
 *  three. Nothing is dropped from the list below them. */
export function fieldAlerts(answer: FieldNotams | undefined): FieldNotam[] {
  return (answer?.notams ?? []).filter((n) => n.closed || n.kind === "tfr").slice(0, ALERTS);
}

/** "Nov 12 1432Z": a NOTAM's time in UTC with its day, as the FAA's
 *  NOTAMs give their times (AIM 5-1-3); a feed time with no zone is UTC. */
export function zulu(iso: string): string {
  const at = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(at.getTime())) return iso;
  const month = at.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const hhmm = `${String(at.getUTCHours()).padStart(2, "0")}${String(at.getUTCMinutes()).padStart(2, "0")}Z`;
  return `${month} ${at.getUTCDate()} ${hhmm}`;
}

/** When it is in force, in words: "In effect now, until Nov 12 1432Z",
 *  "From Nov 12 1200Z", or nothing where the feed gives no times. */
export function whenWords(n: Pick<FieldNotam, "in_force" | "starts" | "ends">): string | null {
  const until = n.ends ? `until ${zulu(n.ends)}` : null;
  if (n.in_force) return until ? `In effect now, ${until}` : "In effect now";
  if (n.starts) return `From ${zulu(n.starts)}${n.ends ? ` ${until}` : ""}`;
  return until ? `In effect ${until}` : null;
}
