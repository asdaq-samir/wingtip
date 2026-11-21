import { useMutation } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api/client";
import { forgetPilotCache } from "../../lib/pilotCache";
import { showError } from "../../lib/problems";

/** What this device keeps for a pilot -- their preferences, the tracks
 *  they flew (lib/track), their drills (features/pilot/drills), the charts kept for
 *  a route -- all under the app's prefix in localStorage. */
const ON_THIS_DEVICE = "wingtip.";

/** This device's copies taken out, as the account they were kept for
 *  goes: the server deletes its own, but cannot reach these. */
export function forgetThisDevice(storage: Storage = window.localStorage) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (key): key is string => key !== null && key.startsWith(ON_THIS_DEVICE),
  );
  for (const key of keys) storage.removeItem(key);
}

/** Deleting the signed-in pilot's account (App Review 5.1.1(v)): the
 *  server takes everything that was theirs and the session, this device
 *  its own copies, and the page starts again signed out -- every store
 *  that read the old preferences reads none. A failure deleted nothing,
 *  and says so in an alert (lib/problems). */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => {
      forgetThisDevice();
      // And the service worker's copy of their account, airplanes and
      // flights, which a start with no signal would show the next person.
      forgetPilotCache();
      window.location.assign("/app/plan");
    },
    onError: (err) => showError("Your Account Was Not Deleted", describeError(err)),
  });
}
