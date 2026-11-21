import { useMutation } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api/client";
import { showError } from "../../lib/problems";
import { forgetWhereTheyFlew } from "./useLogout";

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

/** Everything this device kept for an account that is gone: its
 *  localStorage and this tab's sessionStorage under the app's prefix (the
 *  plan's edit history among them), and what signing out forgets too --
 *  the tracks and trail, the planner's answers asked at the pilot's
 *  points and the service worker's copy of the account. Deleting kept the
 *  last three until the deep security review of 2026-11-21, so on a
 *  shared device the next person offline was shown them. */
export function forgetAccountOnThisDevice(local: Storage = window.localStorage, session: Storage = window.sessionStorage): void {
  forgetThisDevice(local);
  forgetThisDevice(session);
  forgetWhereTheyFlew();
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
      forgetAccountOnThisDevice();
      window.location.assign("/app/plan");
    },
    onError: (err) => showError("Your Account Was Not Deleted", describeError(err)),
  });
}
