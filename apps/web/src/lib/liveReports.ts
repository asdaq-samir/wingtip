/**
 * What the FAA's SWIM feeds say now, as the planner keeps it from ingest
 * (app.routers.live): the ITWS alerts at an airport (AIM 4-3-7), special
 * activity airspace's status from SFDPS, each runway's RVR, the D-ATIS,
 * the Command Center's ground stops and delay programs, and a flight's
 * tower departure events. The queries and the words they are said in;
 * what they mean for a flight is the engine's (the Go / No-Go's findings,
 * rvr_check, read_datis).
 */
import { api } from "./api/client";
import { zuluTime } from "./format";
import type { FlowProgram, ItwsProduct, SaaStatus } from "./api/types";
import type { VerdictInput } from "./verdict";

/** How long an answer is fresh, ms: ITWS's products expire in three
 *  minutes, RVR is made each minute (AIM 7-1-13). */
const LIVE_MS = 60_000;

/** Idents as the planner's lists take them, upper case and once each. */
function idents(list: (string | null | undefined)[]): string[] {
  return [...new Set(list.filter((i): i is string => !!i).map((i) => i.trim().toUpperCase()))].sort();
}

/** The ITWS alerts at these airports. Said nowhere of its own: an empty
 *  answer is no alert, and a failed one leaves the Go / No-Go as it was. */
export const itwsQuery = (airports: (string | null | undefined)[]) => {
  const asked = idents(airports);
  return {
    queryKey: ["live", "itws", asked],
    queryFn: () => api.liveItws(asked),
    enabled: asked.length > 0,
    staleTime: LIVE_MS,
    refetchInterval: LIVE_MS,
    meta: { silent: true },
  };
};

export const flowQuery = (airports: (string | null | undefined)[]) => {
  const asked = idents(airports);
  return {
    queryKey: ["live", "flow", asked],
    queryFn: () => api.liveFlow(asked),
    enabled: asked.length > 0,
    staleTime: 5 * LIVE_MS,
    refetchInterval: 5 * LIVE_MS,
    meta: { silent: true },
  };
};

export const saaQuery = (designators: string[]) => {
  const asked = [...new Set(designators.filter(Boolean))].sort();
  return {
    queryKey: ["live", "saa", asked],
    queryFn: () => api.liveSaa(asked),
    enabled: asked.length > 0,
    staleTime: LIVE_MS,
    refetchInterval: LIVE_MS,
    meta: { silent: true },
  };
};

export const rvrQuery = (airport: string | null | undefined) => ({
  queryKey: ["live", "rvr", airport?.toUpperCase() ?? ""],
  queryFn: () => api.liveRvr(airport!),
  enabled: !!airport,
  staleTime: LIVE_MS,
  refetchInterval: LIVE_MS,
  meta: { silent: true },
});

export const datisQuery = (airport: string | null | undefined) => ({
  queryKey: ["live", "atis", airport?.toUpperCase() ?? ""],
  queryFn: () => api.liveAtis(airport!),
  enabled: !!airport,
  staleTime: 5 * LIVE_MS,
  meta: { silent: true },
});

export const departuresQuery = (ident: string | null | undefined) => ({
  queryKey: ["live", "departures", ident?.toUpperCase() ?? ""],
  queryFn: () => api.liveDepartures(ident!),
  enabled: !!ident && ident.length >= 2,
  staleTime: 5 * LIVE_MS,
  meta: { silent: true },
});

/** A time as the app says one in Zulu: "2130Z". */
export function zulu(unixS: number): string {
  return zuluTime(new Date(unixS * 1000));
}

/** Each ITWS alert in a line with its airport, as the Go / No-Go's
 *  weather finding takes them: "ATL: Runway 27L arrival microburst alert
 *  40 kt, 3 mile final to runway". */
export function itwsLines(products: ItwsProduct[]): string[] {
  return products.flatMap((p) => p.alerts.map((a) => `${p.airport}: ${a.words}`));
}

/** A program in a line: "Ground stop at EWR until 2130Z, delays average
 *  45 min"; a restriction is no program and gives none. */
export function programLine(p: FlowProgram): string | null {
  if (p.restriction || !p.program) return null;
  const name = p.program.charAt(0).toUpperCase() + p.program.slice(1);
  const until = p.ends != null ? ` until ${zulu(p.ends)}` : "";
  const delay = p.average_delay_min != null ? `, delays average ${p.average_delay_min} min` : "";
  return `${name} at ${p.airport}${until}${delay}`;
}

export function programLines(programs: FlowProgram[]): string[] {
  return programs.map(programLine).filter((l): l is string => !!l);
}

type When = VerdictInput["airspace"]["specialUse"][number]["when"];

/** An area's word for the Go / No-Go: SFDPS's status where it has one in
 *  force at the pass (active-now, cold-now), else its times of use's. An
 *  SFDPS status that ends before the flight gets there says nothing of
 *  then, so the schedule's word stands. */
export function liveWhen(scheduled: When, status: SaaStatus | undefined, passAt: Date | null): When {
  if (!status || status.active == null) return scheduled;
  const pass = passAt ? passAt.getTime() / 1000 : null;
  if (status.until != null && pass != null && pass > status.until) return scheduled;
  return status.active ? "active-now" : "cold-now";
}

/** An area's status in words for its card: "Active now until 2130Z
 *  (FAA SFDPS)", "Cold now (FAA SFDPS)". */
export function saaWords(status: SaaStatus | undefined): string | null {
  if (!status || status.active == null) return null;
  const until = status.until != null ? ` until ${zulu(status.until)}` : "";
  const next = !status.active && status.next != null ? `; next active ${zulu(status.next)}` : "";
  return `${status.active ? "Active" : "Cold"} now${until}${next} (FAA SFDPS)`;
}
