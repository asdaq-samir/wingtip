import { ApiError, isDropped } from "./api/client";

/** Whether asking again could answer differently: not for what the
 *  request itself got wrong -- a 4xx, a route with no legal altitude
 *  (lib/api/streams) -- where Try again only showed the same toast
 *  again; a timeout or a rate limit can pass. */
export function retryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status < 400 || error.status >= 500 || error.status === 408 || error.status === 429;
}

/** No answer for want of a connection: the request dropped (Safari's
 *  "Load failed" as the phone locks or the app goes behind another), or
 *  the phone offline. */
const noAnswer = (error: unknown) => isDropped(error) || globalThis.navigator?.onLine === false;

/**
 * TanStack Query's own retries (lib/queryClient's default), only where
 * asking again could answer: one 502 from a planner warming up after a
 * deploy is asked again three times, a 404 (a place not known) is said at
 * once. A connection lost is asked again for as long as the query is
 * wanted: in the air a phone is out of coverage most of the flight, and
 * TanStack's retryer waits, paused, while the page is hidden or the phone
 * offline (its focus and online managers), going on as either comes back.
 */
export function retryOnServerFailure(failures: number, error: unknown): boolean {
  if (noAnswer(error)) return true;
  return failures < 3 && retryable(error);
}

/**
 * How long before asking again: a connection lost, a second after the
 * first drop and then every half minute, not every second all flight (the
 * owner's screenshot, 2026-10-22: a route the planner answers in two
 * seconds showed "The connection dropped" as the pilot came back to the
 * app); anything else TanStack's own doubling, to half a minute.
 */
export function retryDelay(failures: number, error: unknown): number {
  if (noAnswer(error)) return failures === 0 ? 1000 : 30_000;
  return Math.min(1000 * 2 ** failures, 30_000);
}
