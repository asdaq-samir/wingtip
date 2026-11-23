import { planner } from "../../api/http";

/**
 * The route's own answers the page asked the planner for -- its course,
 * checkpoints, nav log and briefing, and its fields' cards -- each by its
 * address as asked, the latest of each, for Keep for the Air to ask again
 * (keepRoute) once the service worker holds the page. Those the page asks
 * on its first load go out before the worker takes over, so the worker
 * never kept them: offline, a kept route opened again had no course and
 * no nav log (flight-critical.spec, "offline from the first ask"). Asked
 * again through the worker, its caches hold them under the same address
 * the page asks offline (vite.config.ts: planner-steady, planner-api).
 */
const ROUTE_ANSWER = /^\/api\/planner\/(course|checkpoints|navlog|briefing|airport\/[^/]+)$/;

/** Every route answer asked, by its address, the latest last: more than
 *  one of a kind for a route, its own and the fuel stops' preview (the
 *  same ends, `stops` the suggested ones), which as "the latest of each"
 *  took the route's own place, so a kept route opened offline had no
 *  course (flight-critical.spec, "offline from the first ask"). */
const asked = new Set<string>();
const KEPT_MAX = 24;

/** A GET's address noted where it is one of the route's answers. */
export function noteRouteAnswer(address: string) {
  const url = new URL(address, "http://localhost");
  if (!ROUTE_ANSWER.test(url.pathname)) return;
  const at = `${url.pathname}${url.search}`;
  asked.delete(at);
  asked.add(at);
  if (asked.size > KEPT_MAX) asked.delete(asked.values().next().value!);
}

planner.use({
  onRequest({ request }) {
    if (request.method === "GET") noteRouteAnswer(request.url);
    return undefined;
  },
});

/** The addresses of the route's answers asked: each between `ends` (the
 *  route's departure and destination, every variant of its stops asked),
 *  and the latest of each field's card; with no ends, the latest of each
 *  kind. */
export function routeAnswersAsked(ends?: { dep: string; dest: string }): string[] {
  const latest = new Map<string, string>();
  for (const at of asked) {
    const url = new URL(at, "http://localhost");
    const dep = url.searchParams.get("dep");
    if (ends && dep !== null) {
      if (dep === ends.dep && url.searchParams.get("dest") === ends.dest) latest.set(at, at);
    } else latest.set(url.pathname, at);
  }
  return [...latest.values()];
}
