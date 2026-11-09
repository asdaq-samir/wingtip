import { useOptimistic } from "react";

/**
 * A pilot's own list kept on the server -- saved flights, logbook flights,
 * airplanes -- shown changed the moment the pilot changes it, as a native
 * list is, rather than after the round trip: React's useOptimistic over
 * the list the query fetched. A change is made inside an Action (a
 * transition, or useActionState's action); while the Action runs the list
 * shows the change, and when it ends the list is the query's own again --
 * the server's answer put in the query's data before then, or, where the
 * server refused, the list as it was, the change gone by itself.
 */

/** One change: a row put in place of the row with its id (or added, at
 *  the top where the list is newest first), or a row taken out. */
export type ListChange<T> = { put: T; first?: boolean } | { drop: number };

/** The list with the change made. */
export function changed<T extends { id: number }>(list: readonly T[], change: ListChange<T>): T[] {
  if ("drop" in change) return list.filter((row) => row.id !== change.drop);
  const { put } = change;
  if (!list.some((row) => row.id === put.id)) return change.first ? [put, ...list] : [...list, put];
  return list.map((row) => (row.id === put.id ? put : row));
}

/** A row added before the server has given it an id: a negative one, never
 *  the server's, so it is not edited or sent until the list is fetched
 *  again with the row's own. */
export function unsavedId(): number {
  return -Date.now();
}

const NONE: never[] = [];

/** The query's list with the Actions' changes over it, and the way to make
 *  one (inside an Action). Undefined while the list is still fetched. */
export function useOptimisticList<T extends { id: number }>(list: T[] | undefined) {
  const [shown, change] = useOptimistic<T[], ListChange<T>>(list ?? NONE, changed);
  return [list ? shown : undefined, change] as const;
}
