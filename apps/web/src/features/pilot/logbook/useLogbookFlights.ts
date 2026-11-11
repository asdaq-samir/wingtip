import { startTransition, useActionState, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../../lib/api/client";
import type { LogbookEntry, LogbookEntryRequest } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { toast } from "../../../lib/toast";
import { unsavedId, useOptimisticList } from "../../../lib/optimisticList";
import { deletedWords, refreshLogbook, requestOf } from "./logbookEntry";

/** A flight the gateway refused: which (null, the new one), what was
 *  typed, and why. */
export type Refused = { id: number | null; entry: LogbookEntryRequest; problem: string };

/** What the form's save asks: a flight to send (a new one without an id),
 *  or the last refusal put away. */
type SaveAsk = { id: number | null; entry: LogbookEntryRequest } | null;

/**
 * The logbook's flights, their one hook (MVVM): the list, the plus's new
 * flight, a flight changed in its own row (the form in the row's place,
 * where it was a popover over the list), and a flight taken out at once
 * with a toast's Undo (lib/toast), in place of asking first: the owner's
 * "Undo after destructive edits" (docs/navigation.md).
 *
 * Each shows the moment the pilot acts (useOptimistic, lib/optimisticList):
 * a saved row reads its new columns, a new flight is at the top of the
 * list, a deleted one is gone, before the gateway has answered. Where it
 * refuses, the list goes back as it was, and the form opens again on what
 * was typed with why under it (`refused`), not in a toast.
 */
export function useLogbookFlights() {
  const queryClient = useQueryClient();
  // Quiet: the list says in place what it could not fetch (QueryState),
  // where a failure read "No flights logged yet".
  const asked = useQuery({ queryKey: ["logbook"], queryFn: api.logbook.list, meta: { silent: true } });
  const [entries, change] = useOptimisticList(asked.data);
  const [adding, setAdding] = useState(false);
  // The flight whose row is its form now.
  const [changing, setChanging] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  const save = useMutation({
    mutationFn: ({ id, entry }: { id: number | null; entry: LogbookEntryRequest }) =>
      id ? api.logbook.update(id, entry) : api.logbook.add(entry),
    // Said under the form (`refused`), not as the alert.
    meta: { silent: true },
  });
  const remove = useMutation({ mutationFn: (entry: LogbookEntry) => api.logbook.remove(entry.id) });
  // Undo: the same flight logged again, its every column and link.
  const restore = useMutation({ mutationFn: (entry: LogbookEntry) => api.logbook.add(requestOf(entry)) });

  // The form's save as an Action: its pending and its refusal are React's
  // (useActionState), and the row shows the flight as saved meanwhile.
  const [refused, send, saving] = useActionState(async (_was: Refused | null, ask: SaveAsk): Promise<Refused | null> => {
    if (!ask) return null;
    const { id, entry } = ask;
    change({ put: { ...entry, id: id ?? unsavedId() }, first: true });
    try {
      await save.mutateAsync({ id, entry });
      done(id ? "Flight Saved" : "Flight Logged");
      // The list fetched again before the Action ends, so the saved row
      // is the server's when the optimistic one gives way.
      await refreshLogbook(queryClient);
      return null;
    } catch (err) {
      // The form again, on what was typed.
      if (id) setChanging(id);
      else setAdding(true);
      return { id, entry, problem: describeError(err, id ? "The flight could not be saved" : "The flight could not be logged") };
    }
  }, null);
  const ask = (next: SaveAsk) => startTransition(() => send(next));
  // Undo: the same flight logged again, at the top of the list at once.
  const undo = (entry: LogbookEntry) =>
    startTransition(async () => {
      change({ put: entry, first: true });
      try {
        await restore.mutateAsync(entry);
      } catch {
        // Gone again by itself; the mutation cache's alert says why.
      }
      await refreshLogbook(queryClient);
    });

  /** Sent with the form closed at once: the row (or the list's top) shows
   *  it while the gateway answers. */
  const saveEntry = (id: number | null, entry: LogbookEntryRequest) => {
    if (id) setChanging(null);
    else setAdding(false);
    ask({ id, entry });
  };

  return {
    asked,
    entries,
    adding,
    /** The plus's popover; closed, its refusal put away. */
    setAdding: (open: boolean) => {
      if (!open && refused && refused.id == null) ask(null);
      setAdding(open);
    },
    editing,
    toggleEditing: () => setEditing((e) => !e),
    changing,
    /** A row tapped: its form in its place. Not a row the gateway has yet
     *  to give an id. */
    change: (id: number) => {
      if (id < 0) return;
      if (refused && refused.id !== id) ask(null);
      setChanging(id);
    },
    /** Cancel or Escape: the row as it was. */
    stopChanging: () => {
      if (refused) ask(null);
      setChanging(null);
    },
    saving,
    /** What the gateway refused, for the form it was typed in. */
    refused,
    add: (entry: LogbookEntryRequest) => saveEntry(null, entry),
    update: (id: number, entry: LogbookEntryRequest) => saveEntry(id, entry),
    /** Gone from the list at once, a toast's Undo giving it back; back,
     *  the alert saying why, if the gateway refuses. */
    remove: (entry: LogbookEntry) => {
      if (entry.id < 0) return;
      startTransition(async () => {
        change({ drop: entry.id });
        try {
          await remove.mutateAsync(entry);
          await refreshLogbook(queryClient);
          toast.undo(deletedWords(entry), () => undo(entry), { testId: "logbook-undo" });
        } catch {
          // Back by itself; the mutation cache's alert says why.
        }
      });
    },
  };
}

export type LogbookFlightsModel = ReturnType<typeof useLogbookFlights>;
