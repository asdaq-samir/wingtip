import type { registerSW } from "virtual:pwa-register";
import { keepAddressThroughReload } from "./freshLoad";

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
 * Answers the plugin's update function, which takes a waiting build
 * now: for a page whose lazy part failed (lib/chunkRecovery), which
 * reloads anyway.
 */
export function takeNewBuildsWhenAway(
  register: typeof registerSW,
  reloadPage = () => window.location.reload(),
): () => Promise<void> {
  let waiting = false;
  let reloadDue = false;
  const away = () => document.visibilityState === "hidden";
  const reload = () => {
    if (!away() || leavingIsAsked()) {
      reloadDue = true;
      return;
    }
    reloadDue = false;
    keepAddressThroughReload();
    reloadPage();
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
    },
    // The new worker has taken over (another tab's update, or this
    // page's own just as it came back): the reload still waits until
    // the page is away.
    onNeedReload: reload,
  });
  document.addEventListener("visibilitychange", () => {
    if (!away()) return;
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
