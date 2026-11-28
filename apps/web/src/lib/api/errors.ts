import type { Detour } from "./types";

/** Why a call failed, said as the server and the browser say it, and as a pilot
 *  can read it (./client's calls reject with these). */

export class ApiError extends Error {
  /** `reasons` and `advice`: why, and what to do, where the server says
   *  (a nav log with no legal altitude), apart from the message;
   *  `detours` the waypoints round high ground, best first; `brief`, all of it in a few words. */
  constructor(
    message: string,
    readonly status: number,
    readonly reasons: string[] = [],
    readonly advice: string | null = null,
    readonly detours: Detour[] = [],
    readonly brief: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The server's own word for what went wrong: `detail` is the
 *  planner's (and the gateway's proxies'), `error` is Spring's where it
 *  sends one. A 401 carries no body at all (Spring Security's own entry
 *  point), and falls through to the status text. FastAPI's own 422 --
 *  a query parameter it could not parse -- sends `detail` as a list of
 *  {loc, msg}, which read "[object Object]" in the toast. */
export async function detailOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { detail?: unknown; error?: string };
  const detail = Array.isArray(body.detail)
    ? body.detail.map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d))).join("; ")
    : typeof body.detail === "string"
      ? body.detail
      : undefined;
  return detail || body.error || response.statusText || statusWords(response.status);
}

/** A status in words, where nothing came with it: over HTTP/2 -- the
 *  phone's https address -- a response has no status text at all, and a
 *  502 from the gateway with an empty body read "request failed" on the
 *  map (the owner's screen recording, 2026-10-28). */
function statusWords(status: number): string {
  if (status === 401) return "Signed out";
  if (status === 403) return "Not allowed";
  if (status === 404) return "Not found";
  if (status === 408 || status === 504) return "No answer in time";
  if (status === 429) return "Too many requests: try again in a minute";
  if (status === 502 || status === 503) return "The planner is not answering";
  if (status >= 500) return `The server hit an error (${status})`;
  return `The server said no (${status})`;
}

/** A response that is not OK, as the `ApiError` every caller expects --
 *  so every call either resolves with its data or rejects. */
export async function failIfNotOk(response: Response): Promise<void> {
  if (!response.ok) throw new ApiError(await detailOf(response), response.status);
}

/**
 * What to tell the pilot about a failure: the error's own message (an
 * `ApiError` carries the server's detail) when it has one, the caller's
 * fallback otherwise. Only the first line -- a server's detail can run
 * to a traceback, and a toast is not the place for one.
 */
/** The browsers' own words for a fetch that never got an answer --
 *  Safari's "Load failed", Chrome's "Failed to fetch", Firefox's
 *  "NetworkError when attempting to fetch resource" -- and Safari's for
 *  the same on a page a service worker answers for, "FetchEvent.respondWith
 *  received an error: TypeError: Load failed", which a pilot read on a
 *  phone, word for word, in a toast. */
const NO_ANSWER = /load failed|failed to fetch|networkerror|respondwith/i;

/** Whether a request got no answer at all: the connection dropped, not
 *  the server saying no. */
export function isDropped(err: unknown): boolean {
  return err instanceof TypeError && NO_ANSWER.test(err.message);
}

export function describeError(err: unknown, fallback = "request failed"): string {
  if (isDropped(err)) {
    return "The connection dropped before the answer arrived";
  }
  // A fetch that gave up on its own `AbortSignal.timeout` -- the
  // developer console's probes -- rejects with the DOM's "signal timed
  // out", which a phone showed in a toast, word for word.
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return "No answer in time";
  }
  // An answer that is not the JSON asked for -- a proxy's HTML error page
  // sent with a 200 -- rejects in the browser's parser's words ("Unexpected
  // token '<', "<!doctype "... is not valid JSON"), which said nothing a
  // pilot can act on: said as the stream reader says it (./http's parsed).
  if (err instanceof SyntaxError) return "The planner's answer came back garbled. Try again in a moment.";
  const firstLine = err instanceof Error ? err.message.split("\n")[0] : undefined;
  // An answer with no words of its own but HTTP's reason ("Not Found",
  // "Bad Gateway"), which the Brief printed raw ("Words unavailable: Not
  // Found"): said as what it means to a pilot.
  // The gateway's own 404 while the planner restarts, which named its path.
  if (err instanceof ApiError && err.status === 404 && plannerUnreachable(err))
    return "The planner isn't answering. Try again in a moment.";
  if (err instanceof ApiError && firstLine && BARE_REASON.test(firstLine)) {
    return err.status === 404 ? "Not available yet" : err.status >= 500 ? "The planner is not answering; try again in a moment" : fallback;
  }
  return firstLine || fallback;
}

/** HTTP's own reason phrases (RFC 9110, section 15), which say nothing a
 *  pilot can act on. */
const BARE_REASON =
  /^(Not Found|Bad Request|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out|Unprocessable (Entity|Content)|Forbidden|Unauthorized|Method Not Allowed|Conflict)$/i;

/** Whether the planner could not find a point of the route: its 404,
 *  which names the ident in quotes ("No airport goes by 'KZZZ'."). The
 *  route box says it on that point's pill, not the map's problem line:
 * the pilot typed it, the system is not down.
 *  A 404 that names nothing is not the planner's answer but the way's:
 *  the gateway's "no such planner endpoint" while the planner restarts
 *  and its document is not in, or a proxy's bare "Not Found" -- which
 *  the route box said as "A point of the route is not an airport or
 *  waypoint we know" (the owner's screenshot, 2026-11-23). */
export function isUnknownPlace(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && /'[^']+'/.test(err.message);
}

/** The gateway's 404 for a path no planner document it holds marks
 *  (PlannerProxyController): the planner's paths not yet read again as
 *  it restarts. */
const NO_SUCH_ENDPOINT = /^no such planner endpoint/i;

/**
 * Whether the planner could not be reached at all -- the request dropped,
 * the gateway's 502, 503 or 504 while it restarts, or the gateway not yet
 * knowing its paths -- as against an answer that says no. Asked again by
 * itself (lib/queryRetry, lib/queryClientCore) until it is back, and said
 * as that, never as the pilot's mistake.
 */
export function plannerUnreachable(err: unknown): boolean {
  if (isDropped(err)) return true;
  if (!(err instanceof ApiError)) return false;
  if (err.status === 502 || err.status === 503 || err.status === 504) return true;
  return err.status === 404 && NO_SUCH_ENDPOINT.test(err.message);
}

/** What the pilot reads while the planner cannot be reached. */
export const PLANNER_UNREACHABLE = "The planner could not be reached. Trying again by itself.";

/** The ident an unknown place's 404 names, if it names one. */
export function unknownPlaceOf(err: unknown): string | null {
  return isUnknownPlace(err) ? (/'([^']+)'/.exec((err as ApiError).message)?.[1]?.toUpperCase() ?? null) : null;
}

/** A point of the route the planner will not plan to: `ident` the one its
 *  404 names (null where it names none), and `outside` where it is a real
 *  field abroad, which the planner says is "outside the US charts"
 *  (wingtip.airport_lookup OutsideCharts), not an ident nobody uses. */
export type UnknownPlace = { ident: string | null; outside: boolean };

/** The unknown place a planner's answer says, or null where it is none. */
export function unknownPlaceIn(err: unknown): UnknownPlace | null {
  if (!isUnknownPlace(err)) return null;
  return { ident: unknownPlaceOf(err), outside: /outside the US charts/i.test((err as ApiError).message) };
}

/** What is wrong with it, after its ident: the route box's line and the
 *  strip's To say the same. */
export const unknownWhy = (place: UnknownPlace) => (place.outside ? "is outside the US charts" : "isn't an airport or waypoint we know");

/** `describeError` for a query's `error` field, which is null while
 *  nothing has failed -- and so is this. */
export const errorMessage = (err: unknown, fallback: string) => (err ? describeError(err, fallback) : null);
