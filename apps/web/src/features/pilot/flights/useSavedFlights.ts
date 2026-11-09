import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../../lib/api/client";
import type { FlightSummary } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { flightsQuery } from "../../../lib/queryClient";
import { flightEdit, flightEditProblem, type FlightEditRequest } from "./flightEdit";

/**
 * The saved flights' list, its one hook (MVVM): the list, Edit's minus
 * and the delete it asks for, and a row's name and notes changed in the
 * row (PATCH /api/flights/{id}). What went wrong with a change is said in
 * that row, under its field (`problem`), not in a toast or an alert
 * (lib/problems: a result shows where it happened).
 */
export function useSavedFlights() {
  const queryClient = useQueryClient();
  const asked = useQuery(flightsQuery);
  const [editing, setEditing] = useState(false);
  const [flightToDelete, setFlightToDelete] = useState<FlightSummary | null>(null);
  // The flight whose row is its fields now, and what is wrong with the
  // last try to save them.
  const [changing, setChanging] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => api.flights.remove(id),
    onSuccess: () => {
      done("Flight Deleted");
      setFlightToDelete(null);
      void queryClient.invalidateQueries({ queryKey: flightsQuery.queryKey });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: FlightEditRequest }) => api.flights.update(id, body),
    // Said in the row (`problem`), not as a system problem.
    meta: { silent: true },
    onSuccess: (saved) => {
      queryClient.setQueryData<FlightSummary[]>(flightsQuery.queryKey, (list) => list?.map((f) => (f.id === saved.id ? saved : f)));
      setChanging(null);
      setProblem(null);
      done("Flight Saved");
    },
    onError: (err) => setProblem(describeError(err, "The flight could not be saved")),
  });

  /** The row's fields, opened in place of the row. */
  const startChange = (id: number) => {
    setProblem(null);
    setChanging(id);
  };
  /** Escape: the row as it was, nothing sent. */
  const cancelChange = () => {
    setProblem(null);
    setChanging(null);
  };
  /** Return or the fields left: what changed sent, nothing sent where
   *  nothing did. */
  const saveChange = (flight: FlightSummary, name: string, notes: string) => {
    if (update.isPending) return;
    const wrong = flightEditProblem(name, notes);
    if (wrong) {
      setProblem(wrong);
      return;
    }
    const body = flightEdit(flight, name, notes);
    if (!body) {
      cancelChange();
      return;
    }
    update.mutate({ id: flight.id, body });
  };

  /** Edit's minus or a swipe: the flight to ask about, then the ask. */
  const askToDelete = (flight: FlightSummary) => setFlightToDelete(flight);

  return {
    asked,
    list: asked.data,
    editing,
    toggleEditing: () => setEditing((e) => !e),
    flightToDelete,
    askToDelete,
    deleteAsked: () => {
      if (flightToDelete) remove.mutate(flightToDelete.id);
    },
    changing,
    problem,
    saving: update.isPending,
    startChange,
    cancelChange,
    saveChange,
  };
}

export type SavedFlightsModel = ReturnType<typeof useSavedFlights>;
