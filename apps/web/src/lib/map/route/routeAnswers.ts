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

const asked = new Map<string, string>();

/** A GET's address noted where it is one of the route's answers. */
export function noteRouteAnswer(address: string) {
  const url = new URL(address, "http://localhost");
  if (ROUTE_ANSWER.test(url.pathname)) asked.set(url.pathname, `${url.pathname}${url.search}`);
}

planner.use({
  onRequest({ request }) {
    if (request.method === "GET") noteRouteAnswer(request.url);
    return undefined;
  },
});

/** The addresses of the route's answers last asked, one per kind (and per
 *  field's card). */
export function routeAnswersAsked(): string[] {
  return [...asked.values()];
}
