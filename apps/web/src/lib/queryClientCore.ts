import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { describeError, isDropped } from "./api/client";
import { retryable, retryDelay, retryOnServerFailure } from "./queryRetry";
import { clearProblem, raiseProblem, showError } from "./problems";

declare module "@tanstack/react-query" {
  interface Register {
    /** `silent`: this query's failure is not a system problem -- the
     *  page shows it in place (a route that has not been collected offers to
     *  collect it) -- either outright or for the errors a function
     *  picks out. */
    queryMeta: { silent?: boolean | ((error: unknown) => boolean) };
    /** `silent`: the mutation reports its own failure. */
    mutationMeta: { silent?: boolean };
  }
}

/**
 * The one query client, with every failure reported in one place: a
 * query that fails is a system problem in the server's own word for it,
 * with a "Try again" that refetches it, a mutation that fails is an
 * alert, and neither page threads error strings around to say so. The
 * exceptions are marked on the query or mutation itself (`meta`).
 *
 * TanStack's own refetch on focus, which asks again only what is stale:
 * the map's weather is current as the phone wakes, the nav log, course and
 * checkpoints (staleTime Infinity) never recomputed. Its own retries, where
 * they could answer (lib/queryRetry), a lost connection's for as long as
 * the query is wanted, paused while the page is hidden or the phone
 * offline; the streams each say `retry: false`.
 *
 * Asked with no connection too ("offlineFirst"), so the service worker's
 * kept answers reach the page in the air; TanStack's "online" paused them
 * unasked (the offline audit's gap 1). What it did not keep fails at once,
 * "No connection" in place (QueryState); a mutation, into its alert.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    // None in the unit tests, as TanStack's testing guide has it.
    queries: { retry: import.meta.env.MODE === "test" ? false : retryOnServerFailure, retryDelay, networkMode: "offlineFirst" },
    mutations: { networkMode: "offlineFirst" },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const silent = query.meta?.silent;
      if (silent === true || (typeof silent === "function" && silent(error))) return;
      // A connection lost is never said: in the air a phone is out of
      // coverage most of the flight, and the line stood over the chart
      // the whole way (the owner, 2026-11-04: "we shouldn't show the
      // errors for internet loss specially in no coverage up in the
      // air"). The page keeps what it had (TanStack keeps a query's data
      // through a failed refetch, the service worker its answers), and
      // a query with retries of its own is asked again by them
      // (lib/queryRetry); one that ends here failed with `retry: false`.
      // The Status page says what is being shown from the cache.
      if (isDropped(error) || globalThis.navigator?.onLine === false) return;
      failingWith.set(query.queryHash, failed(describeError(error), retryable(error)));
    },
    onSuccess: (_data, query) => forget(query.queryHash),
  }),
  // A mutation is something the pilot just did: its failure is the
  // alert's, with OK (lib/problems).
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return;
      showError(describeError(error));
    },
  }),
});

/**
 * Back online, a query whose last ask found no connection is asked again
 * at once. TanStack's retryer goes on by itself only from a pause, taken
 * as a retry comes round while the phone is offline; a retry that failed
 * before the phone knew it was offline waits out its half minute
 * (lib/queryRetry's retryDelay) however soon the connection is back. On
 * CI's runner the logbook's second ask came before the page went offline,
 * and its list said "No connection" for 29 s after it was back
 * (airplane-mode.spec, run 44582598916; traced here, the third ask at
 * 31.6 s, online at 2.7 s).
 */
onlineManager.subscribe((online) => {
  if (!online) return;
  const cache = queryClient.getQueryCache();
  const waiting = cache.findAll({
    type: "active",
    predicate: (query) => query.state.fetchFailureCount > 0 && isDropped(query.state.fetchFailureReason),
  });
  if (!waiting.length) return;
  // Cancelled first: a refetch alone only nudges a retryer that is
  // paused, and leaves one in its wait (TanStack cancels a running fetch
  // for a refetch only once the query has data).
  void Promise.all(waiting.map((query) => query.cancel())).then(() =>
    queryClient.refetchQueries({ type: "active", predicate: (query) => waiting.includes(query) }),
  );
});

/**
 * One problem per distinct thing that went wrong, not one per call that
 * hit it: a system problem (lib/problems), the line beside the map's
 * buttons, until the queries it was about answer.
 *
 * Keyed by the message, not the query: a planner that is down failed the
 * course, the detection stream and the nav log, and three identical
 * "planner service unreachable" toasts stacked up the screen, each
 * offering to retry a third of the page. Its Try again refetches
 * everything currently in error.
 */
/** Which problem each failing query raised: a query's hash to its id. */
const failingWith = new Map<string, string>();

/** A failure's problem goes once every query it was about answers, or
 *  is no longer asked for: a route changed or closed. With no close of
 *  its own, a problem left behind by a route long gone stayed. */
function forget(hash: string) {
  const id = failingWith.get(hash);
  failingWith.delete(hash);
  if (id !== undefined && ![...failingWith.values()].includes(id)) clearProblem(id);
}
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "removed" || (event.type === "observerRemoved" && event.query.getObserversCount() === 0)) {
    forget(event.query.queryHash);
  }
});

function failed(message: string, retry: boolean): string {
  const id = `failed:${message}`;
  raiseProblem({
    id,
    title: message,
    retry: retry ? () => void queryClient.refetchQueries({ predicate: (query) => query.state.status === "error" }) : undefined,
  });
  return id;
}
