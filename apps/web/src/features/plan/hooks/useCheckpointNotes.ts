import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import type { RouteNotes } from "../../../lib/api/types";
import { pilotQuery } from "../../../lib/queryClient";

/** How to spot one checkpoint from the air, as the pilot wrote it --
 *  keyed by lat/lon since that is how the server matches a checkpoint to
 *  its note too. */
export interface Description {
  text: string;
}

export function descriptionKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

type Notes = Record<string, Description>;
const NO_NOTES: Notes = {};

/** The notes kept for the route's checkpoints, by descriptionKey. */
function notesOf(found: RouteNotes): Notes {
  const notes: Notes = {};
  for (const c of found.checkpoints) if (c.saved) notes[descriptionKey(c.lat, c.lon)] = { text: c.saved };
  return notes;
}

/**
 * The "how to spot it" notes for the route's checkpoints: the ones kept
 * for it (the pilot's own, else the shared one), asked of the planner
 * once a route and a pilot are there (POST /api/checkpoint-notes/route),
 * and each edit saved to the planner as it is written (DescriptionCell).
 *
 * Keyed as the planner keeps them: per route and per pilot -- a
 * signed-in pilot's own edits are theirs alone, and after Log out the
 * next person must not see them -- and not per altitude. An edit is
 * written into the cache the moment it is made (TanStack's optimistic
 * update), and a failed save puts back what was there.
 *
 * Its own hook, beside usePlan rather than inside it: notes change for
 * their own reasons -- how they are saved and kept -- and none of them is
 * the nav log's.
 */
export function useCheckpointNotes(dep: string, dest: string, stops: string[] = []) {
  const { data: pilot } = useQuery(pilotQuery);
  const pilotId = pilot?.id ?? null;
  const via = stops.join(",");
  const queryKey = ["descriptions", dep, dest, via, pilotId];
  const queryClient = useQueryClient();
  // Signed in only: the notes are a pilot's (the planner's x-gateway).
  // Fetched once for the route; an edit is written into the same entry.
  const notes =
    useQuery({
      queryKey,
      queryFn: async ({ signal }) => notesOf(await api.checkpointNotes(dep, dest, stops, signal)),
      enabled: pilotId !== null && !!dep && !!dest,
      staleTime: Infinity,
      meta: { silent: true },
    }).data ?? NO_NOTES;

  const saveNote = useMutation({
    mutationFn: ({ lat, lon, text }: { lat: number; lon: number; text: string }) =>
      api.saveCheckpointNote(dep, dest, lat, lon, text, stops),
    // The edit shown the moment it is made, the route's notes still on
    // their way given up so they cannot land over it; a failed save puts
    // back what was there -- but only while the note still holds this
    // text, so a later edit of the same checkpoint that did save is never
    // undone by an earlier one's failure.
    onMutate: async ({ lat, lon, text }) => {
      await queryClient.cancelQueries({ queryKey });
      const key = descriptionKey(lat, lon);
      const before = queryClient.getQueryData<Notes>(queryKey)?.[key] ?? null;
      const saved: Description = { text };
      queryClient.setQueryData<Notes>(queryKey, (now = NO_NOTES) => ({ ...now, [key]: saved }));
      return { queryKey, key, saved, before };
    },
    onError: (_error, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData<Notes>(context.queryKey, (now = NO_NOTES) => {
        if (now[context.key] !== context.saved) return now;
        const { [context.key]: _gone, ...rest } = now;
        return context.before ? { ...rest, [context.key]: context.before } : rest;
      });
    },
  });
  // The save's own promise, so the note's box can keep a pilot's typing
  // until it is safely saved (DescriptionCell); the mutation's own
  // mutateAsync, which keeps its identity.
  const { mutateAsync } = saveNote;
  const saveDescription = useCallback((lat: number, lon: number, text: string) => mutateAsync({ lat, lon, text }), [mutateAsync]);

  return { descriptions: notes, saveDescription };
}
