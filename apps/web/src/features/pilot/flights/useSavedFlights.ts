import { startTransition, useActionState, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../../lib/api/client";
import { flightShares } from "../../../lib/api/sharedFlights";
import { cancelled, shareOrCopy } from "../../../lib/share";
import { showError } from "../../../lib/problems";
import type { FlightSummary } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { toast } from "../../../lib/toast";
import { useOptimisticList } from "../../../lib/optimisticList";
import { holdDelete, releaseDelete, usePendingDeletes } from "../../../lib/pendingDeletes";
import { flightsQuery } from "../../../lib/queryClient";
import { flightEdit, flightEditProblem, flightTitle, type FlightEditRequest } from "./flightEdit";

/** What the row's save asks: a change to send, a problem found before
 *  sending, or the last problem put away (the row opened afresh or let go). */
type SaveAsk = { send: FlightSummary; body: FlightEditRequest } | { wrong: string } | null;

/** The name and notes the pilot typed, kept for the row's fields when the
 *  server refused them, so the pilot fixes them rather than types again. */
type Draft = { name: string; notes: string };

/**
 * The saved flights' list, its one hook (MVVM): the list, Edit's minus
 * and the delete it asks for, and a row's name and notes changed in the
 * row (PATCH /api/flights/{id}). A change shows at once, the row closed
 * on its new name (useOptimistic, lib/optimisticList); where the gateway
 * refuses it the row goes back to what it was and opens again on what was
 * typed, with why under its field (`problem`), not in a toast or an alert
 * (lib/problems: a result shows where it happened). A delete takes the row
 * out at once, with a toast's Undo (the owner's "Undo after destructive
 * edits", docs/navigation.md), and is sent only once the Undo has gone
 * unpressed: the flight is the server's, and can't be filed again as it
 * was (its id, its share). Until then it is kept in this browser
 * (lib/pendingDeletes), so one deleted just before the tab is closed is
 * sent at the next load, not back in the list. A refused one comes back,
 * with the alert every failed action has (the mutation cache's).
 */
export function useSavedFlights() {
  const queryClient = useQueryClient();
  const asked = useQuery(flightsQuery);
  const [optimistic, change] = useOptimisticList(asked.data);
  const [editing, setEditing] = useState(false);
  // The flights deleted whose Undo is still up, or whose tab was closed
  // first: out of the list, not yet sent.
  const deleting = usePendingDeletes("flight");
  const list = deleting.size ? optimistic?.filter((f) => !deleting.has(f.id)) : optimistic;
  // The flight whose row is its fields now, and what was typed in them.
  const [changing, setChanging] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const keep = (saved: FlightSummary) =>
    queryClient.setQueryData<FlightSummary[]>(flightsQuery.queryKey, (now) => now?.map((f) => (f.id === saved.id ? saved : f)));

  const remove = useMutation({ mutationFn: (id: number) => api.flights.remove(id) });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: FlightEditRequest }) => api.flights.update(id, body),
    // Said in the row (`problem`), not as the alert.
    meta: { silent: true },
  });

  // The row's save as an Action: its pending and its problem are React's
  // (useActionState), where they were the hook's own state.
  const [problem, save, saving] = useActionState(async (_was: string | null, ask: SaveAsk): Promise<string | null> => {
    if (!ask) return null;
    if ("wrong" in ask) return ask.wrong;
    const { send: flight, body } = ask;
    // Null keeps a field, blank clears it (flightEdit).
    change({ put: { ...flight, name: body.name ?? flight.name, notes: body.notes ?? flight.notes } });
    try {
      keep(await update.mutateAsync({ id: flight.id, body }));
      done("Flight Saved");
      return null;
    } catch (err) {
      // Back to the row's fields, on what was typed.
      setChanging(flight.id);
      return describeError(err, "The flight could not be saved");
    }
  }, null);
  const ask = (next: SaveAsk) => startTransition(() => save(next));
  // The last problem put away, where there is one: an Action queued for
  // nothing would hold up the next save's change behind it.
  const putAway = () => {
    if (problem) ask(null);
  };

  /** The row's fields, opened in place of the row. */
  const startChange = (id: number) => {
    setDraft(null);
    putAway();
    setChanging(id);
  };
  /** Escape: the row as it was, nothing sent. */
  const cancelChange = () => {
    setDraft(null);
    putAway();
    setChanging(null);
  };
  /** Return or the fields left: what changed sent, nothing sent where
   *  nothing did; the row closed on it at once. */
  const saveChange = (flight: FlightSummary, name: string, notes: string) => {
    const wrong = flightEditProblem(name, notes);
    if (wrong) {
      ask({ wrong });
      return;
    }
    const body = flightEdit(flight, name, notes);
    if (!body) {
      cancelChange();
      return;
    }
    setDraft({ name, notes });
    setChanging(null);
    ask({ send: flight, body });
  };

  /** Edit's minus or its menu's Remove: gone from the list at once, a
   *  toast's Undo giving it back; sent once the Undo has gone. */
  const deleteFlight = (flight: FlightSummary) => {
    const { id } = flight;
    holdDelete("flight", id);
    let undone = false;
    toast.undo(
      `${flightTitle(flight)} Deleted`,
      () => {
        undone = true;
        releaseDelete("flight", id);
      },
      {
        testId: "saved-flight-undo",
        onClose: () => {
          if (undone) return;
          remove
            .mutateAsync(id)
            .then(() => queryClient.setQueryData<FlightSummary[]>(flightsQuery.queryKey, (now) => now?.filter((f) => f.id !== id)))
            // Refused: back in the list; the mutation cache's alert says why.
            .catch(() => {})
            .finally(() => {
              releaseDelete("flight", id);
              void queryClient.invalidateQueries({ queryKey: flightsQuery.queryKey });
            });
        },
      },
    );
  };

  /** Share: the flight shared by link, with its N-number where it has one,
   *  read-only until Stop Sharing, and the link sent on from the share
   *  sheet, or copied. The list keeps the share, for its Stop Sharing. */
  const shareFlight = async (flight: FlightSummary) => {
    try {
      const share = await flightShares.share(flight.id, true);
      keep({ ...flight, share });
      if ((await shareOrCopy({ title: flightTitle(flight), url: share.url })) === "copied") done("Link Copied");
    } catch (err) {
      if (!cancelled(err)) showError("Not shared", describeError(err));
    }
  };
  /** Stop Sharing: the link answers no more, for anyone it was sent to. */
  const stopSharing = async (flight: FlightSummary) => {
    try {
      await flightShares.stop(flight.id);
      keep({ ...flight, share: null });
      done("Sharing Stopped");
    } catch (err) {
      showError("Still shared", describeError(err));
    }
  };

  return {
    asked,
    list,
    shareFlight,
    stopSharing,
    editing,
    toggleEditing: () => setEditing((e) => !e),
    deleteFlight,
    changing,
    draft,
    problem,
    saving,
    startChange,
    cancelChange,
    saveChange,
  };
}

export type SavedFlightsModel = ReturnType<typeof useSavedFlights>;
