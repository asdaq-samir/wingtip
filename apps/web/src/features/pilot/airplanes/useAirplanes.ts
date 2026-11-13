import { startTransition } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../../lib/api/client";
import type { Aircraft, AircraftRequest } from "../../../lib/api/types";
import { done } from "../../../lib/doneNote";
import { unsavedId, useOptimisticList } from "../../../lib/optimisticList";
import { aircraftListQuery } from "../../../lib/queryClient";

/** One save: which airplane (null, a new one) and its figures. */
export interface AirplaneSave {
  id: number | null;
  request: AircraftRequest;
}

/**
 * The pilot's airplanes and their figures, saved to the gateway: the list
 * shows a save the moment the form is sent -- the row's new speeds and
 * burns, a new airplane at the list's foot -- and a delete the moment it
 * is asked (useOptimistic, lib/optimisticList), the form closed at once.
 * Where the gateway refuses a save the list goes back as it was and
 * `onRefused` opens the form again on what was typed, with why; a refused
 * delete brings the row back with the alert every failed action has.
 */
export function useAirplanes(onRefused: (save: AirplaneSave, problem: string) => void) {
  const queryClient = useQueryClient();
  const asked = useQuery(aircraftListQuery);
  const [list, change] = useOptimisticList(asked.data);
  // The list fetched again before an Action ends, so the saved row is the
  // server's when the optimistic one gives way.
  const refresh = () => queryClient.invalidateQueries({ queryKey: aircraftListQuery.queryKey });

  const save = useMutation({
    mutationFn: ({ id, request }: AirplaneSave) => (id ? api.aircraft.update(id, request) : api.aircraft.add(request)),
    // Said in the form, opened again (`onRefused`), not as the alert.
    meta: { silent: true },
  });
  const remove = useMutation({ mutationFn: (id: number) => api.aircraft.remove(id) });

  return {
    list,
    isLoading: asked.isLoading,
    saving: save.isPending,
    save: (asked: AirplaneSave) =>
      startTransition(async () => {
        const was = asked.id ? list?.find((a) => a.id === asked.id) : undefined;
        // A new airplane's other columns (its handbook, inspections) are
        // the server's to fill: the row shows what was typed.
        // Its own figures (the profile's) stay the record's until it answers.
        const { figures: _own, ...columns } = asked.request;
        change({ put: { ...(was ?? ({} as Aircraft)), ...columns, id: asked.id ?? unsavedId() } });
        try {
          await save.mutateAsync(asked);
          // The one place a list's save has nothing else to announce it: a
          // row quietly changing below the form.
          done(asked.id ? "Airplane Saved" : "Airplane Added");
        } catch (err) {
          onRefused(asked, describeError(err, asked.id ? "The airplane could not be saved" : "The airplane could not be added"));
        }
        await refresh();
      }),
    remove: (id: number) =>
      startTransition(async () => {
        change({ drop: id });
        try {
          await remove.mutateAsync(id);
          done("Airplane Deleted");
        } catch {
          // Back by itself; the mutation cache's alert says why.
        }
        await refresh();
      }),
  };
}
