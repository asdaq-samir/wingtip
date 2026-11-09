import type { Where } from "../../../../lib/verdict";
import { clockTime, duration, zuluTime } from "../../../../lib/format";
import { placeOfPoint } from "../../../../lib/identSchema";
import { callEngine } from "../../../../lib/engine/engine";

/**
 * The passengers' briefing on the Brief, ticked off before engine start,
 * in the order of the FAA's SAFETY briefing (the FAASTeam's "Passenger
 * SAFETY briefing", FAA Safety Briefing, Jan/Feb 2007 and Jul/Aug 2014):
 * Seat belts, Air, Fire, Exits, Traffic and talking, Your questions. Of
 * them only the belts are a rule: 14 CFR 91.107 asks the pilot in command
 * to show each person how to fasten and unfasten their belt and harness
 * ((a)(1)) and to tell them to have them fastened to taxi, take off and
 * land ((a)(2), (3)). The rest is what the Private Pilot ACS (FAA-S-ACS-6C)
 * asks of a passenger briefing in task PA.II.B, skill S2 -- doors,
 * passenger conduct, sterile aircraft, propeller avoidance, emergency
 * procedures -- and is cited as guidance, not as a regulation. The items and their sources are
 * the engine's (`passenger_briefing`, brief's passengers.rs), which the
 * iPhone (Passengers.swift) and Android (briefing/PassengerBriefing.kt)
 * ask too, under the same keys.
 */
export interface PassengerItem extends Partial<Where> {
  key: string;
  title: string;
  /** Where it comes from: the rule that asks for it, or the FAA's guidance. */
  rule: string;
}

/** The briefing's items in its order, the engine's. */
export function passengerItems(): PassengerItem[] {
  return callEngine("passenger_briefing", {});
}

/** The flight in a few lines for the passengers, to send them: where to,
 *  when it leaves and lands (this device's clock, and UTC), and the
 *  destination's weather now, where it reports. */
export function passengerMessage(f: {
  dep: string;
  dest: string;
  destName: string | null;
  depart: Date | null;
  eteMin: number | null;
  /** The destination's report now, in words ("VFR, 10 sm"). */
  weather: string | null;
}): string {
  const flying = f.eteMin == null ? null : duration(f.eteMin);
  // From the exact minutes, as the nav log's and the kneeboard's arrival
  // is (etaAt): from the rounded ones it said 10:00 where they said 09:59.
  const lands = f.depart && f.eteMin != null ? new Date(f.depart.getTime() + f.eteMin * 60_000) : null;
  return [
    `${placeOfPoint(f.dep)} to ${f.destName ? `${f.destName} (${f.dest})` : f.dest}`,
    f.depart
      ? `Leaving ${clockTime(f.depart)} (${zuluTime(f.depart)})${flying ? `, about ${flying} in the air` : ""}${lands ? `, landing about ${clockTime(lands)}` : ""}.`
      : flying ? `About ${flying} in the air.` : null,
    f.weather ? `Weather at ${f.dest} now: ${f.weather}.` : null,
  ].filter(Boolean).join("\n");
}
