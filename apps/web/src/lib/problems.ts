import { create } from "zustand";
import { isDropped } from "./api/client";

/**
 * What went wrong, said where it belongs and taking no more room than it
 * must, as Apple's guidelines and the accessibility ones have it: an
 * error is not a toast that floats over the work.
 *
 * - A problem with the route (no legal altitude) is the route's own:
 *   PlanWorkspace says it in the panel, under the route.
 * - Something the app could not do that is not the pilot's doing -- the
 *   planner or a service out, a download that failed -- is a system
 *   problem: one line beside the map's buttons (ProblemBanner), gone when
 *   what caused it has (`clearProblem`).
 * - A one-off failure of something the pilot just did -- a share, a
 *   save -- is iOS's alert (ErrorAlert, `showError`), with OK.
 *
 * Brief news that goes by itself -- the progress line, "Link Copied" --
 * stays a toast (lib/toast). Errors and warnings were toasts drawn by
 * hand, folded to lines that the panel had to stop short of.
 */

/** A system problem: the line's words, and how to ask again where it can. */
interface SystemProblem {
  id: string;
  title: string;
  retry?: () => void;
}

export const useSystemProblems = create<{ problems: SystemProblem[] }>(() => ({ problems: [] }));

/** Said, or said again in its place: one id is one problem. */
export function raiseProblem(problem: SystemProblem) {
  useSystemProblems.setState((s) => ({
    problems: s.problems.some((p) => p.id === problem.id)
      ? s.problems.map((p) => (p.id === problem.id ? problem : p))
      : [...s.problems, problem],
  }));
}

/** What caused it has gone. */
export function clearProblem(id: string) {
  useSystemProblems.setState((s) => ({ problems: s.problems.filter((p) => p.id !== id) }));
}

/** A one-off failure, for the alert: one at a time, the latest. */
interface FailedAction {
  title: string;
  description?: string | null;
}

/** `held` while a sheet that must not be stacked on is up (the first
 *  flight's welcome): the alert waits for it, then says what failed. */
export const useFailedAction = create<{ failed: FailedAction | null; held: boolean }>(() => ({ failed: null, held: false }));

export function showError(title: string, description?: string | null) {
  useFailedAction.setState({ failed: { title, description } });
}

/** What a list or a figure says, in place, where its answer could not be
 *  had for want of a network: in the air, most of a flight. */
export const NO_CONNECTION = "No connection";

/** A query's own flags (TanStack Query's), as far as a connection goes. */
interface Asked {
  isError: boolean;
  error?: unknown;
  /** The last try's failure while TanStack's retries go on. */
  failureReason?: unknown;
  fetchStatus?: "fetching" | "paused" | "idle";
}

/**
 * Whether a query has no answer because there is no connection: paused,
 * waiting on one (a mutation, or a query retried while offline or
 * hidden), asked again after its request dropped (lib/queryRetry asks a
 * lost connection again for as long as the query is wanted, so it is
 * never in error for it), or failed with the request dropped or the
 * browser offline. The service
 * worker answers what it kept first (networkMode "offlineFirst",
 * lib/queryClient), so this is what it did not keep.
 */
export function noConnection(query: Asked): boolean {
  if (query.fetchStatus === "paused") return true;
  if (query.fetchStatus === "fetching" && isDropped(query.failureReason)) return true;
  return query.isError && (isDropped(query.error) || globalThis.navigator?.onLine === false);
}
