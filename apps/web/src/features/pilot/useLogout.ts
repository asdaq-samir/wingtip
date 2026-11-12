import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { forgetChecklists } from "../../lib/checklists";
import { forgetPilot } from "../../lib/preferences";
import { forgetKeptRecord } from "../keptForAir";
import { pilotQuery } from "../../lib/queryClient";
import { forgetPilotCache } from "../../lib/pilotCache";

/** Logging out: the session ended on the server, then the pilot and
 *  everything that was theirs (their airplanes, their flights)
 *  dropped from the cache, so the consoles read signed-out at once, and
 *  what this device kept of theirs forgotten (forgetPilot, their
 *  airplanes' checklists, and the service worker's pilot-own cache), at
 *  the owner's pick of the audit's recommendation. */
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
      // Which route was kept for the air is theirs; the briefing, NOTAMs,
      // cards and plates it lists are public FAA and weather data, and stay.
      forgetKeptRecord();
      // The service worker's copy of their account, airplanes and
      // flights (vite.config.ts, pilot-own), which a start with no
      // signal would otherwise show the next person to pick up the phone.
      forgetPilotCache();
      queryClient.removeQueries({ queryKey: ["aircraft"] });
      queryClient.removeQueries({ queryKey: ["flights"] });
      void queryClient.invalidateQueries({ queryKey: pilotQuery.queryKey });
    },
  });
}
