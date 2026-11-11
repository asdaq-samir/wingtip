import type { FlightSummary, LogbookDraft, LogbookEntryRequest } from "../../lib/api/types";
import type { EngineAnswer } from "../../lib/engine/engine";
import type { RecordedPoint } from "./recorder";

/** The engine's draft, as the planner answers it or the engine in the
 *  browser works it out (the same rule, logbook_from_track). */
type Drafted = LogbookDraft | EngineAnswer<"logbook_from_track">;

/** What the pilot may change of the draft before it is logged: the
 *  figures a logbook's columns hold, as typed. */
export interface Edits {
  flownOn?: string;
  aircraft?: string;
  route?: string;
  totalHours?: number;
  nightHours?: number;
  crossCountryHours?: number;
  dayLandings?: number;
  nightLandings?: number;
  remarks?: string;
}

/**
 * Whether the recorded flight has ended, by the engine's own reading of
 * the track: a landing in it, the track not ending in the air, and the
 * flight time over (the engine's block ends where the airplane came to
 * rest after landing, 14 CFR 1.1) before the last point recorded. Past
 * `askedTo`, the end last offered, so a draft let go is not offered again.
 */
export function flightEnded(local: Drafted | null, points: RecordedPoint[], askedTo: number | null): number | null {
  const last = points.at(-1);
  const to = local?.block.to ?? null;
  if (!local || !last || local.ends_airborne || local.landings.length === 0 || to === null || to >= last.t) return null;
  return askedTo !== null && to <= askedTo ? null : to;
}

/**
 * The entry the gateway keeps (POST /api/logbook): the draft's columns
 * with the pilot's changes, and 61.57(c)'s approaches, holding and
 * tracking (the draft's `instrument`) only where the pilot says the
 * flight was flown by instruments -- no track shows that (61.51(g)(1)).
 */
export function entryRequest(draft: Drafted, edits: Edits, byInstruments: boolean, flightId: number | null): LogbookEntryRequest {
  const e = draft.entry;
  return {
    flownOn: edits.flownOn ?? e.flownOn,
    aircraft: (edits.aircraft ?? e.aircraft) || null,
    aircraftType: e.aircraftType ?? null,
    route: edits.route ?? e.route,
    totalHours: edits.totalHours ?? e.totalHours,
    nightHours: edits.nightHours ?? e.nightHours,
    crossCountryHours: edits.crossCountryHours ?? e.crossCountryHours,
    dayLandings: edits.dayLandings ?? e.dayLandings,
    nightLandings: edits.nightLandings ?? e.nightLandings,
    remarks: edits.remarks ?? e.remarks,
    dualHours: 0,
    soloHours: 0,
    instrumentHours: 0,
    toweredLandings: e.toweredLandings,
    distanceNm: e.distanceNm,
    longestLegNm: e.longestLegNm,
    approaches: byInstruments ? draft.instrument.approaches : 0,
    holding: byInstruments && draft.instrument.holding,
    tracking: byInstruments && draft.instrument.tracking,
    airHours: e.airHours,
    touchAndGoes: e.touchAndGoes,
    fromTrack: true,
    flightId,
  };
}

/** The saved flight this one was most likely flown as: the newest whose
 *  departure and destination are the route's ends; the pilot picks
 *  another or none. */
export function likelyFlight(flights: FlightSummary[], route: string): FlightSummary | null {
  const idents = route.split(" ").filter(Boolean);
  const [from, to] = [idents[0], idents.at(-1)];
  return flights.find((f) => f.departureIdent === from && f.destinationIdent === to) ?? null;
}
