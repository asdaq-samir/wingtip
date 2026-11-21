import { callEngine } from "../../lib/engine/engine";
import type { Landing } from "./procedureTypes";

/** The runway landed on where the route flies an approach: the
 *  approach's own, straight in, unless the pilot picked another and its
 *  plate publishes circling minimums (AIM 5-4-20, 14 CFR 91.175); a
 *  wind's pick gives way to it. The engine's `landing_runway`
 *  (engine/crates/brief/src/runway/landing.rs), so the phones and the web
 *  land on the same one. `runway` null: none picked and none the
 *  approach's; `othersAllowed`: whether another runway may be picked. */
export function landingRunway(
  landing: Landing | null,
  picked: string | null,
  byPilot: boolean,
): { runway: string | null; othersAllowed: boolean } {
  const a = callEngine("landing_runway", {
    approach: landing !== null,
    straight_in: landing?.runway ?? null,
    circling: landing?.circling ?? null,
    picked,
    by_pilot: byPilot,
  });
  return { runway: a.runway, othersAllowed: a.others_allowed };
}
