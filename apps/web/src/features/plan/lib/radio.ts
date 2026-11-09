/**
 * The radio calls for a route, worded as the AIM and AC 90-66C word them
 * (the roadmap's radio scripts, ACS PA.III.A): the engine's
 * (`radio_script`, engine/crates/wording/src/wording/script.rs), which
 * the iPhone can ask the same way. Here only what the web holds: the
 * runways the pilot picked in FPL, else the wind's (features/plan/lib/pattern
 * runwayFlown), which the calls name and the pattern card draws.
 *
 * Words in [brackets] are the pilot's to fill in: the ATIS letter, where
 * they are on the field. A script to practise from and to have on the
 * kneeboard -- a controller may ask for something else, and the pilot
 * says what they ask.
 */
import type { Briefing, Frequency, Leg } from "../../../lib/api/types";
import { pickedEnd, runwayFlown, type InUse, type RunwayEnd, type RunwayPicks } from "./pattern";
import { callEngine } from "../../../lib/engine/engine";

type Facilities = Briefing["airports"][string];

/** The airplane's call sign: its make and its registration spoken, the N
 *  dropped (AIM 4-2-4), or its make and a blank where the planner has no
 *  registration for it -- the engine's (`radio_call_sign`). */
export function callSign(make: string, tail: string | null): string {
  return callEngine("radio_call_sign", { make, tail });
}

/** What a pilot calls a field: its name without "Airport",
 *  "International" and the like -- "Waukegan" for Waukegan National
 *  Airport (the engine's `radio_place_name`). */
export function placeName(name: string | null | undefined, ident: string): string {
  return callEngine("radio_place_name", { name: name ?? null, ident });
}

export interface RadioCall {
  /** Who is called, or listened to: "Waukegan Tower", "ATIS". */
  to: string;
  mhz: number | null;
  /** What is said, or for a broadcast, what to listen for. */
  words: string;
  /** When, or why, where it is not plain. */
  note?: string;
  /** A broadcast listened to, not a station called. */
  listen?: boolean;
}

export interface RadioPhase {
  title: string;
  ident: string;
  kind: "departure" | "arrival";
  /** The runway in use, for the pattern card; null where none has a
   *  heading. */
  end: RunwayEnd | null;
  byWind: boolean;
  calls: RadioCall[];
}

interface RadioInput {
  callSign: string;
  /** The airports landed at, in order, with the briefing's facilities. */
  airports: { ident: string; facilities: Facilities }[];
  legs: Leg[];
  /** The runways the pilot picked in FPL; the wind's where none. */
  picks?: RunwayPicks | null;
}

const sentEnd = (inUse: InUse | null) => (inUse ? { ident: inUse.end.ident, traffic: inUse.end.traffic ?? null } : null);
const sentFrequencies = (frequencies: Frequency[]) =>
  frequencies.map(f => ({ type: f.type ?? null, description: f.description ?? null, frequency_mhz: f.frequency_mhz ?? null }));

/** The route's calls, airport by airport: leaving the departure, into
 *  and out of each stop, and into the destination. */
export function radioScript(input: RadioInput): RadioPhase[] {
  // Each field's runway out and in: the pilot's pick, else the wind's.
  const flown = input.airports.map(({ ident, facilities }, i) => ({
    takeoff: runwayFlown(facilities.runways, pickedEnd(input.picks, ident, "takeoff", i === 0)),
    landing: runwayFlown(facilities.runways, pickedEnd(input.picks, ident, "landing", false)),
  }));
  const phases = callEngine("radio_script", {
    call_sign: input.callSign,
    airports: input.airports.map(({ ident, facilities }, i) => ({
      ident, name: facilities.name ?? null, airspace_class: facilities.airspace_class ?? null,
      frequencies: sentFrequencies(facilities.frequencies), pattern_altitude_ft: facilities.pattern?.altitude_ft ?? null,
      takeoff: sentEnd(flown[i]!.takeoff), landing: sentEnd(flown[i]!.landing),
    })),
    legs: input.legs.map(l => ({ from: l.from, to: l.to, true_course_deg: l.true_course_deg, altitude_ft: l.altitude_ft })),
  });
  // The engine's phases come field by field, the arrival before the
  // departure: each one's runway is that field's landing or takeoff.
  const runways = flown.flatMap((f, i) => [
    ...(i > 0 ? [f.landing] : []),
    ...(i < flown.length - 1 ? [f.takeoff] : []),
  ]);
  return phases.map((phase, i) => {
    const inUse = runways[i] ?? null;
    return { ...phase, end: inUse?.end ?? null, byWind: inUse?.byWind ?? false };
  });
}

/** One field's leaving and arriving: its part of the route's script
 *  (radioScript), none for a local flight, with no route to call along.
 *  The Brief's airport sections (AirportSections, PatternRadio) read it,
 *  and leave out the frequencies and runways its calls and pattern say. */
export function fieldPhases(briefing: Briefing, landings: string[], legs: Leg[], callSign: string, at: string,
  picks?: RunwayPicks | null): RadioPhase[] {
  const airports = landings.filter(ident => briefing.airports[ident]).map(ident => ({ ident, facilities: briefing.airports[ident]! }));
  if (airports.length < 2) return [];
  return radioScript({ callSign, airports, legs, picks }).filter(phase => phase.ident === at);
}
