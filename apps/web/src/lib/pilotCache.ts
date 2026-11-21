import { api } from "./api/client";
import type { Pilot } from "./api/types";

/** The service worker's cache of the pilot's own answers -- who is signed
 *  in, their airplanes, their flights (vite.config.ts) -- kept 30 days so a
 *  start with no signal still knows them. */
export const PILOT_CACHE = "pilot-own";

/** That cache emptied: it is one pilot's, on a phone another may pick up.
 *  Logging out, deleting the account and a session the server no longer
 *  knows all do it (the security audit's L8, 2026-11-10). */
export function forgetPilotCache(): void {
  if ("caches" in globalThis) void caches.delete(PILOT_CACHE).catch(() => undefined);
}

/** The service worker's caches of the planner's answers whose addresses
 *  carry a point -- Nearest, the airspace at a place, what is ahead of the
 *  airplane (vite.config.ts, planner-now and planner-api) -- which on a
 *  shared device are a record of where the last pilot was (the prelaunch
 *  audit's P4). */
export const PLANNER_CACHES = ["planner-now", "planner-api"] as const;

/** Those caches emptied as a pilot signs out (the owner, 2026-11-21: "I
 *  will take your recommendations"); they fill again online, and the
 *  steady data (planner-steady, the charts, the diagrams) stays. */
export function forgetPlannerAnswers(): void {
  if (!("caches" in globalThis)) return;
  for (const name of PLANNER_CACHES) void caches.delete(name).catch(() => undefined);
}

/** Who is signed in (api.me); signed out -- the server's 204, a session
 *  that expired or was ended elsewhere -- the last pilot's cached copies
 *  forgotten, which the worker's network-first answer would otherwise show
 *  the next start with no signal. */
export async function signedInPilot(): Promise<Pilot | null> {
  const pilot = await api.me();
  if (pilot === null) forgetPilotCache();
  return pilot;
}
