import { useMemo } from "react";
import { ApiError } from "./api/client";
import { keptStore } from "./storage";

/**
 * Deletes whose Undo is still up, kept in this browser (lib/storage) until
 * they are sent. A list that deletes with a toast's Undo sends the delete
 * only once the toast has gone unpressed (useSavedFlights), so a delete
 * made just before the tab was closed was never sent, and the flight was
 * back at the next visit. Kept here, it is sent at the next load
 * (`flushPendingDeletes`, main.tsx), and the list leaves it out meanwhile.
 */

/** What a pending delete is of: a saved flight (DELETE /api/flights/{id}). */
export type DeleteKind = "flight";

interface PendingDelete {
  kind: DeleteKind;
  id: number;
}

const KEY = "wingtip.pendingDeletes";
const usePending = keptStore<PendingDelete[]>(KEY, []);

function without(list: PendingDelete[], kind: DeleteKind, id: number) {
  return list.filter((p) => p.kind !== kind || p.id !== id);
}

/** A delete held while its Undo is up: kept until it is sent or undone. */
export function holdDelete(kind: DeleteKind, id: number): void {
  usePending.setState({ value: [...without(usePending.getState().value, kind, id), { kind, id }] });
}

/** Undone, sent, or refused: no longer pending. */
export function releaseDelete(kind: DeleteKind, id: number): void {
  const now = usePending.getState().value;
  const next = without(now, kind, id);
  if (next.length !== now.length) usePending.setState({ value: next });
}

/** The ids of `kind` pending now, for a list to leave out. */
export function usePendingDeletes(kind: DeleteKind): ReadonlySet<number> {
  const all = usePending((s) => s.value);
  return useMemo(() => new Set(all.filter((p) => p.kind === kind).map((p) => p.id)), [all, kind]);
}

/** Whether a failed send is worth trying at a later load: not signed in
 *  (401), the server down (5xx), or no answer at all. Any other refusal
 *  (gone already, 404; not the pilot's, 403) is final. */
function worthRetrying(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 401 || err.status >= 500;
}

/** Every pending delete sent, each by its kind's call; those sent or
 *  finally refused let go, the rest kept for the next load. How many
 *  were let go, for the caller to fetch its lists again. */
export async function flushPendingDeletes(send: Record<DeleteKind, (id: number) => Promise<unknown>>): Promise<number> {
  const pending = usePending.getState().value;
  let done = 0;
  for (const { kind, id } of pending) {
    try {
      await send[kind](id);
    } catch (err) {
      if (worthRetrying(err)) continue;
    }
    releaseDelete(kind, id);
    done++;
  }
  return done;
}
