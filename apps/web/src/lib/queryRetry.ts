import { ApiError } from "./api/client";

/** Whether asking again could answer differently: not for what the
 *  request itself got wrong -- a 4xx, a route with no legal altitude
 *  (lib/api/streams) -- where Try again only showed the same toast
 *  again; a timeout or a rate limit can pass. */
export function retryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status < 400 || error.status >= 500 || error.status === 408 || error.status === 429;
}

/** TanStack Query's own three retries (lib/queryClient's default), only
 *  where asking again could answer: one 502 from a planner warming up
 *  after a deploy is asked again, a 404 (a place not known) is said at once. */
export function retryOnServerFailure(failures: number, error: unknown): boolean {
  return failures < 3 && retryable(error);
}
