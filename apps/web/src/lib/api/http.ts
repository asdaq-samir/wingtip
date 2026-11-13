import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";
import type { paths as GatewayPaths } from "./gateway-schema";
import { noteAnswer } from "../fromCache";
import { REQUEST_ID_HEADER, newRequestId } from "./requestId";
import { TimedRequest, markInFlight } from "./inFlight";
import { failIfNotOk } from "./errors";

/**
 * The CSRF header for a request that changes state, and nothing for a
 * GET. The server sets the token as a readable cookie and expects it
 * echoed back; session cookies are attached by the browser on their
 * own, which is the condition CSRF exploits, so this is what tells our
 * own request apart from someone else's page making the same one. The
 * one place the rule lives -- both clients' middleware and the plain
 * fetches ask it.
 */
export function csrfHeaders(method: string): Record<string, string> {
  if (method.toUpperCase() === "GET") return {};
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match?.[1] ? { "X-XSRF-TOKEN": decodeURIComponent(match[1]) } : {};
}

/** The two rules above, each call's request id (./requestId) and its wait in flight (./inFlight). */
const csrfAndFailures: Middleware = {
  onRequest({ request }) {
    for (const [name, value] of Object.entries(csrfHeaders(request.method))) request.headers.set(name, value);
    markInFlight(request).headers.set(REQUEST_ID_HEADER, newRequestId());
    return request;
  },
  async onResponse({ request, response }) {
    // From the network or the service worker's cache, said on the map
    // where it is the cache's (lib/fromCache). The request's address,
    // not the response's: one the worker makes up has none.
    noteAnswer(request.url, response);
    await failIfNotOk(response);
  },
};

/**
 * Everything chart- and plan-related is served by the Python planner,
 * reached through the Spring Boot gateway rather than directly: one
 * origin means one session and one set of access rules, and the
 * planner itself publishes no port. The schema's `/api/…` paths are
 * served under `/api/planner/…` (PlannerProxyController), and this is
 * the Request the planner's client makes, the prefix written into its
 * address as it is made.
 *
 * It was a middleware that made a second Request of the first, which
 * hands a body over as a stream -- and Safari cannot send one
 * ("ReadableStream uploading is not supported"), so on an iPhone every
 * POST to the planner failed before it left: a rating, a note, a build.
 * Made here, the body is the JSON openapi-fetch serialised.
 */
export class GatewayRequest extends TimedRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === "string" ? input.replace(/^([a-z]+:\/\/[^/]+)?\/api\//i, "$1/api/planner/") : input, init);
  }
}

export const planner = createClient<paths>({ baseUrl: "", Request: GatewayRequest });
planner.use(csrfAndFailures);

/** The Spring Boot endpoints, on this same origin. */
export const gateway = createClient<GatewayPaths>({ baseUrl: "", Request: TimedRequest });
gateway.use(csrfAndFailures);

/** A schema's shape as openapi-fetch hands it back: every fixed-length
 *  tuple ([lat, lon]) widened to a plain array. */
type Widened<T> = T extends readonly (infer E)[] ? Widened<E>[] : T extends object ? { [K in keyof T]: Widened<T[K]> } : T;

/** The data of a call that resolved (the middleware above has already
 *  thrown for anything else), as the named shape from ./types -- the
 *  same schema with its tuples restored. Checked, not merely cast: the
 *  call's own response type must be `T` widened, so naming the wrong
 *  schema, or a field the schema has since lost, is a compile error. */
export const data = <T>(result: { data?: Widened<T> }): T => result.data as T;

/**
 * Newline-delimited JSON, one line at a time as the bytes arrive: the
 * nav log, the detections, the checkpoint notes and the narratives all
 * stream this shape. A chunk can split a line, so only whole lines are
 * parsed; the decoder is the browser's own.
 */
export async function* ndjson<T>(stream: ReadableStream | undefined): AsyncGenerator<T> {
  if (!stream) return;
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await quietFor(reader, STREAM_QUIET_MS);
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield parsed<T>(line);
    }
  }
  if (buffer.trim()) yield parsed<T>(buffer);
}

/** How long a stream may say nothing before it is given up, ms: the
 *  planner's nav log sends a line every 8 s while it works (its
 *  HEARTBEAT_S), and the narratives' first words come within a minute. A
 *  stalled one kept "Asking the planner…" up for the gateway's ten
 *  minutes (the audit's finding). */
export const STREAM_QUIET_MS = 90_000;

/** The reader's next piece, or a TimeoutError -- "No answer in time"
 *  (describeError) -- once it has been quiet for `ms`, the stream given up. */
async function quietFor<R>(reader: ReadableStreamDefaultReader<R>, ms: number): Promise<ReadableStreamReadResult<R>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const quiet = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Refused before the reader is let go: its cancel settles the read
      // waiting on it as a clean end, which would win the race.
      reject(new DOMException("The planner went quiet", "TimeoutError"));
      void reader.cancel().catch(() => undefined);
    }, ms);
  });
  try {
    return await Promise.race([reader.read(), quiet]);
  } finally {
    clearTimeout(timer);
  }
}

/** One line of a stream, or one plain error where it is not JSON -- a
 *  gateway's HTML error page in the middle of a stream read "Unexpected
 *  token <" to the pilot. */
function parsed<T>(line: string): T {
  try {
    return JSON.parse(line) as T;
  } catch {
    throw new Error("The planner's answer came back garbled");
  }
}

/** A route's stops as the planner takes them, "KDSM,KLNK"; none, none. */
export const stopsParam = (stops?: string[]) => (stops?.length ? stops.join(",") : undefined);
