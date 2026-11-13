/**
 * The debriefs the coach reads, from the pilot's own saved flights: each
 * flight of the last half year with a track saved to the account is
 * debriefed against its plan (the engine's debrief, as the flight's page
 * does: its legs and its pattern entries, PA.VI.A and PA.III.B) and each
 * approach it flew into its destination against the procedure (the
 * engine's approach_find, as components/ApproachDebrief does), trimmed to
 * what proficiency_plan reads. Nothing is judged here: the engine finds
 * what is weak in them.
 */
import { api } from "../../../lib/api/client";
import type { Flight, FlightSummary, ProcedureDrawing } from "../../../lib/api/types";
import { localDay } from "../../../lib/format";
import { procedureQuery, proceduresQuery, queryClient } from "../../../lib/queryClient";
import { findApproaches, type ApproachDebrief } from "../../../components/approachDebriefModel";
import type { TrackPoint } from "../../../lib/track";
import { debriefOf } from "../debrief";
import type { CoachDebrief } from "./coachApi";

/** The newest flights looked at: a few weeks' flying, and each one asks
 *  for its track, its fields and its approaches. */
const MOST_FLIGHTS = 6;
/** The engine reads the debriefs of the last half year (its RECENT_DAYS);
 *  older flights are not fetched at all. */
const RECENT_MS = 183 * 86_400_000;
/** A field's approaches drawn at most: the CIFP lists a dozen at a big one. */
const MOST_APPROACHES = 6;

/** The flight's debrief as the engine gives it, trimmed; null where the
 *  track never flew. `patterns` are its fields' pattern altitudes. */
function flightDebrief(flight: Flight, points: TrackPoint[], patterns: Record<string, number>, flownOn: string): CoachDebrief | null {
  const { debrief: d } = debriefOf(flight, points, patterns);
  if (!d) return null;
  return {
    kind: "flight",
    flown_on: flownOn,
    place: `${flight.departureIdent}-${flight.destinationIdent}`,
    profile: [],
    findings: [],
    legs: d.legs.map((l) => ({ from: l.from, to: l.to, altitude_within: l.altitude_within, course_within: l.course_within, ok: l.ok })),
    patterns: d.patterns.map((p) => ({ ident: p.ident, off_ft: p.off_ft, ok: p.ok })),
  };
}

/** An approach debriefed, trimmed: its procedure, its profile and
 *  findings, and the field's elevation for the 500 ft gate. */
export function approachDebrief(a: ApproachDebrief, elevationFt: number | null, flownOn: string): CoachDebrief {
  return {
    kind: "approach",
    flown_on: flownOn,
    place: a.airport,
    // The chart's name ("ILS Y RWY 08"), so the coach says which approach.
    procedure: a.name,
    elevation_ft: elevationFt,
    legs: [],
    patterns: [],
    profile: a.profile.track.map((p) => ({ to_go_nm: p.toGoNm, alt_ft: p.altFt, off: p.off })),
    findings: a.findings.map((f) => ({ tone: f.tone, text: f.text })),
  };
}

/** The day a track flew, on the pilot's calendar. */
const dayOf = (ms: number) => localDay(new Date(ms));

async function drawings(ident: string): Promise<ProcedureDrawing[]> {
  // Through the query cache, under the keys the map and a flight's page
  // keep them by: a field's approaches already drawn are not asked again.
  const listed = await queryClient.fetchQuery(proceduresQuery(ident)).catch(() => null);
  const approaches = (listed?.procedures ?? []).filter((p) => p.kind === "approach").slice(0, MOST_APPROACHES);
  const drawn = await Promise.all(
    approaches.map((p) => queryClient.fetchQuery(procedureQuery({ ident, id: p.id, transition: null })).catch(() => null)),
  );
  return drawn.filter((d): d is ProcedureDrawing => !!d);
}

async function ofFlight(summary: FlightSummary): Promise<CoachDebrief[]> {
  const track = await api.flights.track(summary.id);
  const first = track?.points[0];
  if (!track || !first) return [];
  const flight = await api.flights.get(summary.id);
  const flownOn = dayOf(first.t);
  const fields = [...new Set([flight.departureIdent, flight.destinationIdent])];
  const places = await Promise.all(fields.map((f) => api.airport(f).catch(() => null)));
  const patterns = Object.fromEntries(
    fields.flatMap((f, i) => {
      const ft = places[i]?.pattern?.altitude_ft;
      return ft == null ? [] : [[f, ft]];
    }),
  );
  const out: CoachDebrief[] = [];
  const flown = flightDebrief(flight, track.points, patterns, flownOn);
  if (flown) out.push(flown);
  const dest = flight.destinationIdent;
  const elevation = places[fields.indexOf(dest)]?.elevation_ft ?? null;
  for (const a of findApproaches(await drawings(dest), track.points)) out.push(approachDebrief(a, elevation, flownOn));
  return out;
}

/** The debriefs of the pilot's newest flights with a track, the newest
 *  first; a flight whose track or plan cannot be had is left out. */
export async function recentDebriefs(now = Date.now()): Promise<CoachDebrief[]> {
  const flights = await api.flights.list();
  const recent = flights
    .filter((f) => now - Date.parse(f.plannedFor ?? f.createdAt) <= RECENT_MS)
    .sort((a, b) => Date.parse(b.plannedFor ?? b.createdAt) - Date.parse(a.plannedFor ?? a.createdAt))
    .slice(0, MOST_FLIGHTS);
  const each = await Promise.all(recent.map((f) => ofFlight(f).catch(() => [] as CoachDebrief[])));
  return each.flat();
}
