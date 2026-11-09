import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import type { LogbookEntry, LogbookEntryRequest } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { deletedWords, refreshLogbook, requestOf } from "./logbookEntry";

/**
 * The logbook's flights, their one hook (MVVM): the list, the plus's new
 * flight, a flight changed in its own row (the form in the row's place,
 * where it was a popover over the list), and a flight taken out at once
 * with an Undo row where it was (components/UndoRow), in place of asking
 * first: the owner's "Undo after destructive edits" (docs/navigation.md).
 */
export function useLogbookFlights() {
  const queryClient = useQueryClient();
  // Quiet: the list says in place what it could not fetch (QueryState),
  // where a failure read "No flights logged yet".
  const asked = useQuery({ queryKey: ["logbook"], queryFn: api.logbook.list, meta: { silent: true } });
  const [adding, setAdding] = useState(false);
  // The flight whose row is its form now.
  const [changing, setChanging] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  // The flight last taken out, for its Undo row.
  const [gone, setGone] = useState<LogbookEntry | null>(null);
  const refresh = () => refreshLogbook(queryClient);

  const save = useMutation({
    mutationFn: ({ id, entry }: { id?: number; entry: LogbookEntryRequest }) =>
      id ? api.logbook.update(id, entry) : api.logbook.add(entry),
    onSuccess: (_saved, { id }) => {
      done(id ? "Flight Saved" : "Flight Logged");
      setAdding(false);
      setChanging(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (entry: LogbookEntry) => api.logbook.remove(entry.id),
    onSuccess: (_none, entry) => {
      setGone(entry);
      refresh();
    },
  });
  // Undo: the same flight logged again, its every column and link.
  const restore = useMutation({ mutationFn: (entry: LogbookEntry) => api.logbook.add(requestOf(entry)), onSuccess: refresh });
  const forget = useCallback(() => setGone(null), []);

  return {
    asked,
    entries: asked.data,
    adding,
    setAdding,
    editing,
    toggleEditing: () => setEditing((e) => !e),
    changing,
    /** A row tapped: its form in its place. */
    change: (id: number) => setChanging(id),
    /** Cancel or Escape: the row as it was. */
    stopChanging: () => setChanging(null),
    saving: save.isPending,
    add: (entry: LogbookEntryRequest) => save.mutate({ entry }),
    update: (id: number, entry: LogbookEntryRequest) => save.mutate({ id, entry }),
    remove: (entry: LogbookEntry) => remove.mutate(entry),
    /** The Undo row's words, while there is one. */
    undoWords: gone ? deletedWords(gone) : null,
    undo: () => {
      if (gone) restore.mutate(gone);
    },
    forget,
  };
}

export type LogbookFlightsModel = ReturnType<typeof useLogbookFlights>;
