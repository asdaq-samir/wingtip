import { useFlying } from "../mapChrome";

/**
 * Requests on a weak link in flight (the offline audit's gap 8): a phone
 * at one bar often leaves a request hanging rather than failing it.
 *
 * - A read in flying mode carries FLYING_HEADER, and the service worker
 *   gives it four seconds of network, not fifteen, before the answer it
 *   kept (vite-plugins/workboxRules' flight rule).
 * - A request that sends data fails "No answer in time" (describeError)
 *   after SEND_IN_FLIGHT_MS in flight, where it had no timeout at all:
 *   a clearance's places or the NOTAMs' ranking hung unseen.
 */

/** The header that says a read is asked in flight. */
const FLYING_HEADER = "X-Wingtip-Flying";

/** How long a request that sends data waits in flight. */
const SEND_IN_FLIGHT_MS = 10_000;

/** A read marked as asked in flight, for the worker's shorter wait. */
export function markInFlight(request: Request): Request {
  if (request.method === "GET" && useFlying.getState().flying) request.headers.set(FLYING_HEADER, "1");
  return request;
}

/** A request that sends data, given SEND_IN_FLIGHT_MS in flight -- set as
 *  the Request is made, so its body stays the JSON string (a second
 *  Request of the first hands it over as a stream, which Safari cannot
 *  send; client's GatewayRequest). */
export function timedInFlight(init: RequestInit | undefined, flying = useFlying.getState().flying): RequestInit | undefined {
  const method = (init?.method ?? "GET").toUpperCase();
  if (!flying || method === "GET" || method === "HEAD") return init;
  const timeout = AbortSignal.timeout(SEND_IN_FLIGHT_MS);
  // AbortSignal.any is Safari 17.4's; before it, the caller's own signal.
  const both = "any" in AbortSignal && init?.signal ? AbortSignal.any([init.signal, timeout]) : null;
  const signal = both ?? init?.signal ?? timeout;
  return { ...init, signal };
}

/** A Request timed in flight: the gateway's, and the planner's under its
 *  own (client's GatewayRequest). */
export class TimedRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, timedInFlight(init));
  }
}
