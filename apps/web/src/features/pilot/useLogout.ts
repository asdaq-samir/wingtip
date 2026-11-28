import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { forgetChecklists } from "../../lib/checklists";
import { forgetPilot } from "../../lib/preferences";
import { forgetKeptRecord } from "../keptForAir";
import { pilotQuery } from "../../lib/queryClient";
import { forgetPilotCache, forgetPlannerAnswers } from "../../lib/pilotCache";
import { clearOwnTrail } from "../../lib/map/position/ownTrail";
import { forgetKeptTracks } from "../../lib/track";
import { forgetRecordedTrack } from "../logbook-auto";

/** What this device kept of where the signed-in pilot was and flew, and
 *  the service worker's copies of their answers, forgotten: as they sign
 *  out, and as their account is deleted (useDeleteAccount), which kept
 *  all of these until the deep security review of 2026-11-21. */
export function forgetWhereTheyFlew(): void {
  // Which route was kept for the air is theirs; the briefing, NOTAMs,
  // cards and plates it lists are public FAA and weather data, and stay.
  forgetKeptRecord();
  // Where they flew: the tracks kept under their flights, and the one
  // the phone's GPS recorded for a logbook draft, which would
  // otherwise be offered to the next pilot as their own flight.
  forgetKeptTracks();
  forgetRecordedTrack();
  // And own ship's trail, and the planner's answers asked at their
  // points (Nearest, the airspace there), which said where they were
  // to the next person on a shared device (the owner, 2026-11-21).
  clearOwnTrail();
  forgetPlannerAnswers();
  // The service worker's copy of their account, airplanes and
  // flights (vite.config.ts, pilot-own), which a start with no
  // signal would otherwise show the next person to pick up the phone.
  forgetPilotCache();
}

/** Logging out: the session ended on the server, then the pilot and
 *  everything that was theirs (their airplanes, their flights)
 *  dropped from the cache, so the consoles read signed-out at once, and
 *  what this device kept of theirs forgotten (forgetPilot, their
 *  airplanes' checklists, and the service worker's pilot-own cache), at the owner's pick. */
/** The queries that are the pilot's own records, by their first key. */
const PILOT_RECORDS = ["aircraft", "flights", "logbook", "currency", "training", "paperwork", "reminders", "instructor"] as const;

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      // Signed out first, so forgetting their home airport here is not
      // taken for a pick to write to the account (lib/homeAirport).
      queryClient.setQueryData(pilotQuery.queryKey, null);
      forgetPilot();
      forgetChecklists();
      forgetWhereTheyFlew();
      // Their records too, each fresh for a minute (RECORDS_FRESH_MS):
      // kept, the next pilot signed in within it was shown them.
      for (const key of PILOT_RECORDS) queryClient.removeQueries({ queryKey: [key] });
      void queryClient.invalidateQueries({ queryKey: pilotQuery.queryKey });
    },
  });
}
