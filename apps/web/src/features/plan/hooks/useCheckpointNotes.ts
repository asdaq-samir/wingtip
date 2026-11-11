import { useCallback, useMemo } from "react";
import { experimental_streamedQuery as streamedQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../../lib/api/client";
import type { CheckpointDescriptionMessage } from "../../../lib/api/types";
import { ended } from "../../../lib/api/streams";
import { pilotQuery } from "../../../lib/queryClient";
import { subscriptionQuery } from "../../../lib/subscription";

/** How to spot one checkpoint from the air. "saved" means a pilot's own
 *  earlier edit, not a fresh LLM generation; "error" means that one
 *  checkpoint's generation failed and `text` is empty, left for a
 *  pilot to fill in by hand -- keyed by lat/lon since that is how the
 *  server matches a checkpoint to its note too. */
export interface Description {
  text: string;
  source: "generated" | "saved" | "error";
}

export function descriptionKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/**
 * One "how to spot it" line per checkpoint, streamed on a pilot's own
 * click (the nav log's button) and never on its own: every line is an
 * LLM call. Once asked for, kept for the route.
 *
 * Keyed as the planner keeps them: per route and per pilot -- a
 * signed-in pilot's own edits are theirs alone, and after Log out the
 * next person must not see them -- and not per altitude, which the
 * request does not even send. A pilot's own edit is written into the
 * same cache the moment it is made (TanStack's optimistic update), as
 * the line the stream would say for a saved note; so "has it run" is
 * whether the stream began (its start line), not whether the query was
 * ever written, or an edit before a run would keep Generate from
 * running.
 *
 * Its own hook, beside usePlan rather than inside it: notes change for
 * their own reasons -- how they are generated, saved and kept -- and
 * none of them is the nav log's.
 */
export function useCheckpointNotes(dep: string, dest: string, stops: string[] = []) {
  const { data: pilot } = useQuery(pilotQuery);
  const pilotId = pilot?.id ?? null;
  const via = stops.join(",");
  const queryKey = ["descriptions", dep, dest, via, pilotId];
  const descriptions = useQuery({
    queryKey,
    queryFn: streamedQuery({
      // Ended or failed, never cut off unsaid: a stream that stopped half
      // way looked finished, and its error line was never shown (the
      // audit's finding). The notes that came before it stay.
      streamFn: ({ signal }) => ended(api.describeCheckpoints(dep, dest, signal, stops), "checkpoint descriptions"),
      // A run after an edit adds to what is there rather than starting
      // the cache afresh, which would take the pilot's edits with it.
      refetchMode: "append",
    }),
    enabled: false,
    staleTime: Infinity,
    // One of the month's runs each: never run twice unasked.
    retry: false,
  });
  // The query's own refetch and flags, not its result, which is new at
  // every render: so was this, and with it the nav log drawn again at
  // every render of the page (as useNarrative).
  const { isFetching, isError, refetch } = descriptions;
  const ran = !!descriptions.data?.some((m) => m.type === "start");
  // One of the month's runs (the subscription's cap): its count, asked
  // again once the run is done.
  const queryClient = useQueryClient();
  // Once a run has written them, not again; a run that failed, again.
  const generateDescriptions = useCallback(() => {
    if (isFetching || (ran && !isError)) return;
    void refetch().then(() => queryClient.invalidateQueries({ queryKey: subscriptionQuery.queryKey }));
  }, [isFetching, ran, isError, refetch, queryClient]);

  const descriptionMap = useMemo(() => {
    const map: Record<string, Description> = {};
    for (const m of descriptions.data ?? []) {
      if (m.type !== "checkpoint") continue;
      const key = descriptionKey(m.lat, m.lon);
      // The pilot's own note stays over a line generated after it.
      if (map[key]?.source === "saved" && m.source !== "saved") continue;
      map[key] = { text: m.description ?? "", source: m.source };
    }
    return map;
  }, [descriptions.data]);
  const descriptionError = descriptions.error ? describeError(descriptions.error, "The descriptions could not be written") : null;
  const descriptionProgress = useMemo(() => {
    if (!descriptions.isFetching) return null;
    const started = (descriptions.data ?? []).find((m) => m.type === "start");
    const done = (descriptions.data ?? []).filter((m) => m.type === "checkpoint").length;
    return { done, total: started && started.type === "start" ? started.count : 0 };
  }, [descriptions.data, descriptions.isFetching]);

  const saveNote = useMutation({
    mutationFn: ({ lat, lon, text }: { lat: number; lon: number; text: string }) =>
      api.saveCheckpointNote(dep, dest, lat, lon, text, stops),
    // The edit shown the moment it is made, in the route's own cache
    // entry; a failed save puts back what was there -- but only while
    // the note still holds this text, so a later edit of the same
    // checkpoint that did save is never undone by an earlier one's
    // failure.
    onMutate: ({ lat, lon, text }) => {
      const key = descriptionKey(lat, lon);
      const before = (queryClient.getQueryData<CheckpointDescriptionMessage[]>(queryKey) ?? []).find(isNote(key)) ?? null;
      const saved: NoteLine = {
        ...(before ?? { type: "checkpoint", id: key, lat, lon, detail: null }),
        type: "checkpoint",
        description: text,
        source: "saved",
      };
      queryClient.setQueryData<CheckpointDescriptionMessage[]>(queryKey, (lines = []) => withNote(lines, key, saved));
      return { queryKey, key, saved, before };
    },
    onError: (_error, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData<CheckpointDescriptionMessage[]>(context.queryKey, (lines = []) =>
        lines.find(isNote(context.key)) === context.saved ? withNote(lines, context.key, context.before) : lines,
      );
    },
  });
  // The save's own promise, so the note's box can keep a pilot's typing
  // until it is safely saved (DescriptionCell).
  // The mutation's own mutateAsync, which keeps its identity, for the same
  // reason.
  const { mutateAsync } = saveNote;
  const saveDescription = useCallback((lat: number, lon: number, text: string) => mutateAsync({ lat, lon, text }), [mutateAsync]);

  return { descriptions: descriptionMap, descriptionError, descriptionProgress, generateDescriptions, saveDescription };
}

type NoteLine = Extract<CheckpointDescriptionMessage, { type: "checkpoint" }>;

/** Whether a line of the stream is this checkpoint's note. */
const isNote =
  (key: string) =>
  (m: CheckpointDescriptionMessage): m is NoteLine =>
    m.type === "checkpoint" && descriptionKey(m.lat, m.lon) === key;

/** The stream's lines with this checkpoint's note put in its place (or
 *  after the rest), or taken out for none. */
function withNote(lines: CheckpointDescriptionMessage[], key: string, note: NoteLine | null) {
  const at = lines.findIndex(isNote(key));
  if (at < 0) return note ? [...lines, note] : lines;
  return note ? lines.map((m, i) => (i === at ? note : m)) : lines.filter((_, i) => i !== at);
}
