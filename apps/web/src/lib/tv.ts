/**
 * The TV apps (the TV shells, in git history: Samsung's Tizen and LG's webOS): the site in the
 * TV's own web engine, opened by each app's page with `?tv=` and its
 * platform, driven by a remote's arrows, OK and Back rather than a
 * finger or a mouse. The planner rewrites its address with each change,
 * so the platform is kept for the visit; a TV's own browser is known by
 * its agent.
 */
export type TvPlatform = "tizen" | "webos";

const KEY = "wingtip.tv";

/** Which TV this page is on, or null off one. */
export function tvPlatform(): TvPlatform | null {
  try {
    const asked = new URLSearchParams(window.location.search).get("tv");
    if (asked === "tizen" || asked === "webos") sessionStorage.setItem(KEY, asked);
    const kept = sessionStorage.getItem(KEY);
    if (kept === "tizen" || kept === "webos") return kept;
  } catch {
    // No storage (a private window): the agent alone says.
  }
  const agent = navigator.userAgent;
  if (/Tizen/i.test(agent) && /SMART-TV|SmartTV/i.test(agent)) return "tizen";
  if (/Web0S|webOS/i.test(agent) && /SmartTV|SMART-TV/i.test(agent)) return "webos";
  return null;
}

/** The remotes' Back: Samsung's Return (10009, "XF86Back") and LG's Back
 *  (461, "GoBack"), as their makers' guides give them. */
export const isBack = (event: KeyboardEvent) =>
  event.keyCode === 10009 || event.keyCode === 461 || event.key === "XF86Back" || event.key === "GoBack" || event.key === "BrowserBack";

/** The keys that zoom the map in and out where a remote has no + and -:
 *  OK on the map, and a channel up and down (LG sends them as PageUp and
 *  PageDown; Samsung's ChannelUp and ChannelDown are 427 and 428). */
export const zoomInKey = (event: KeyboardEvent) =>
  event.key === "Enter" || event.key === "PageUp" || event.key === "ChannelUp" || event.keyCode === 427;
export const zoomOutKey = (event: KeyboardEvent) => event.key === "PageDown" || event.key === "ChannelDown" || event.keyCode === 428;
