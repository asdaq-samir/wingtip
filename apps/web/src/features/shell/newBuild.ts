import type { registerSW } from "virtual:pwa-register";
import { toast } from "../../lib/toast";
import { keepAddressThroughReload } from "./freshLoad";

/** How long a new build waits with the page in front before it is
 *  offered: a page kept open all day (a home-screen app on an iPhone,
 *  which may be suspended before its hidden-time reload runs) otherwise
 *  stayed on an old build with no sign of it (the owner, 2026-11-12, on a
 *  fix that had not reached the phone). */
export const OFFER_AFTER_MS = 5 * 60_000;

/** vite-plugin-pwa's stock prompt (its ReloadPrompt pattern: "Reload" to
 *  take the new build, or close it), as the app's stock toast with its
 *  action: news, not an error. Stays until it is answered. */
function offerReload(reloadNow: () => void, testId = "new-build") {
  toast.add({
    id: testId,
    title: "Update Ready",
    description: "A newer Wingtip is ready.",
    timeout: 0,
    actionProps: { children: "Reload", onClick: reloadNow, ...{ "data-testid": `${testId}-reload` } },
  });
}

/**
 * A new build is taken while the app is away, never under the pilot.
 * vite-plugin-pwa's stock "prompt" mode (vite.config.ts) leaves a new
 * worker waiting, the browser's own behaviour, and says so
 * (onNeedRefresh); with no prompt, the page takes it the moment it is
 * hidden -- the app put in the background, the phone locked -- with the
 * plugin's own update function, whose takeover reloads the page
 * (onNeedReload). An app closed instead opens on the new build by
 * itself, the waiting worker taking over once no page holds it. A
 * reload mid-use lost the open cards, a half-typed route and the dry
 * run's place, and asked "Leave site?" over a changed logbook entry.
 *
 * A page with something unsaved (a beforeunload handler that cancels:
 * the logbook's EntryForm) is not reloaded; it waits for the next time
 * it is hidden, or the next open.
 *
 * The browser checks for a new worker on its own only on a navigation,
 * so a page kept open -- the phone, all day -- asks every minute and as
 * it comes back to the front: an iPhone stops a page's timers while it
 * is away. The check is one small request for sw.js.
 *
 * A build still waiting after OFFER_AFTER_MS with the page in front is
 * offered (offerReload): the pilot can see there is one and take it now.
 * The build id is in Setup's About (AboutPanel).
 *
 * Answers the plugin's update function, which takes a waiting build
 * now: for a page whose lazy part failed (lib/chunkRecovery), which
 * reloads anyway.
 */
export function takeNewBuildsWhenAway(
  register: typeof registerSW,
  reloadPage = () => window.location.reload(),
  offer: (reloadNow: () => void) => void = offerReload,
): () => Promise<void> {
  let waiting = false;
  let reloadDue = false;
  // The pilot's own Reload, from the offer: taken in front.
  let asked = false;
  let offerTimer: number | undefined;
  const away = () => document.visibilityState === "hidden";
  const reload = () => {
    if (!asked && (!away() || leavingIsAsked())) {
      reloadDue = true;
      armOffer();
      return;
    }
    reloadDue = false;
    keepAddressThroughReload();
    reloadPage();
  };
  // The offer, once the build has waited OFFER_AFTER_MS in front, or has
  // taken over with the page still on the old one (on an iPhone the
  // update asked for as the page was hidden can finish only as it comes
  // back, its reload then held for the next time it is away): armed again
  // each time the page comes back with it still due (an iPhone stops a
  // page's timers while it is away).
  const due = () => waiting || reloadDue;
  const armOffer = () => {
    if (!due() || away() || offerTimer !== undefined) return;
    offerTimer = window.setTimeout(() => {
      offerTimer = undefined;
      if (!due() || away()) return;
      offer(() => {
        asked = true;
        if (reloadDue) return reload();
        waiting = false;
        void update();
      });
    }, OFFER_AFTER_MS);
  };
  const take = () => {
    if (!away() || leavingIsAsked()) return;
    waiting = false;
    void update();
  };
  const update = register({
    immediate: false,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => void registration.update(), 60_000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration.update();
      });
    },
    onNeedRefresh() {
      waiting = true;
      take();
      armOffer();
    },
    // The new worker has taken over (another tab's update, or this
    // page's own just as it came back): the reload still waits until
    // the page is away.
    onNeedReload: reload,
  });
  document.addEventListener("visibilitychange", () => {
    if (!away()) return armOffer();
    if (reloadDue) reload();
    else if (waiting) take();
  });
  return () => update();
}

/** Whether leaving now would make the browser ask "Leave site?": the
 *  page's own beforeunload handlers asked, as the browser asks them. */
export function leavingIsAsked(): boolean {
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  return leaving.defaultPrevented;
}
