/**
 * The trip planner in the Brief's Ask (TripPlanner): a trip in the pilot's
 * own words ("VFR to Oshkosh Saturday morning, stay out of the Chicago
 * Class B, back by 5") sent to the assistant's POST /api/trip-plan with the
 * plan and record the app has (useAsk's contextNow) and this device's time
 * zone, its stream read as it comes -- the tool in use as a passing line,
 * the reason, then the proposal and its sources. Nothing is applied until
 * the pilot taps Use: each leg goes in through the route box's own setters
 * (useAsk's applyChange, the planning workspace's while it is up), the
 * same way a chip the assistant proposes does.
 */
import { experimental_streamedQuery as streamedQuery, isCancelledError, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AssistantChange, Source } from "../../lib/api/assistant";
import { ApiError, csrfHeaders, describeError, failIfNotOk, ndjson } from "../../lib/api/client";
import { requestIdHeaders } from "../../lib/api/requestId";
import type { TripAsk, TripLeg, TripMessage, TripProposal } from "../../lib/api/types";
import { contextNow, useAsk } from "../../lib/ask/useAsk";

interface TripState {
  asked: string;
  status: string | null;
  words: string;
  proposal: TripProposal | null;
  sources: Source[];
  error: string | null;
  busy: boolean;
  /** The legs loaded, by kind. */
  used: string[];
}

const START: TripState = { asked: "", status: null, words: "", proposal: null, sources: [], error: null, busy: false, used: [] };

/** A leg as the route box takes it: the assistant's change, the altitude
 *  left out where the planner chose none. */
export function changeOf(leg: TripLeg): AssistantChange {
  const { dep, dest, stops, altitude_ft, depart } = leg.change;
  return { dep, dest, stops, depart, ...(altitude_ft != null ? { altitude_ft } : {}) };
}

/** One line of the stream folded into the state. */
export function step(state: TripState, event: TripMessage): TripState {
  switch (event.type) {
    case "tool":
      return { ...state, status: event.label };
    case "text":
      return { ...state, status: null, words: state.words + event.text };
    case "plan":
      return { ...state, proposal: event.proposal };
    case "sources":
      return { ...state, sources: event.sources };
    case "error":
      return { ...state, status: null, error: event.words, busy: false };
    default:
      return { ...state, status: null, busy: false };
  }
}

/** The trip planner's stream, one line at a time, ended at its "done" or
 *  "error" line. */
async function* planTrip(body: TripAsk, signal: AbortSignal): AsyncGenerator<TripMessage> {
  const res = await fetch("/api/planner/trip-plan", {
    method: "POST",
    signal,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson", ...csrfHeaders("POST"), ...requestIdHeaders() },
  });
  if (res.status === 401) throw new ApiError("Sign in to plan a trip", 401);
  await failIfNotOk(res);
  for await (const event of ndjson<TripMessage>(res.body ?? undefined)) {
    yield event;
    if (event.type === "done" || event.type === "error") return;
  }
}

/** The trip asked, a query of its own (TanStack's streamedQuery folding
 *  each line in with `step`): a new ask is a new key, which lets the last
 *  one go and aborts its fetch; Stop cancels it where it is, keeping what
 *  came; whether it is still coming and its failure are the query's. The
 *  legs Used stay apart, the pilot's own. */
export function useTripPlanner() {
  const client = useQueryClient();
  // Counted on through a Clear, so no ask meets an older one's answer.
  const [ask, setAsk] = useState<{ body: TripAsk | null; n: number }>({ body: null, n: 0 });
  const [used, setUsed] = useState<string[]>([]);
  const canUse = useAsk((s) => s.applyChange !== null);
  const { body } = ask;
  const queryKey = ["trip-plan", ask.n];
  const asked = body?.text ?? "";
  const { data, error, isFetching } = useQuery({
    queryKey,
    queryFn: streamedQuery({
      streamFn: ({ signal }: { signal: AbortSignal }) => planTrip(body!, signal),
      reducer: (state: TripState, event: TripMessage) => step(state, event),
      initialValue: { ...START, asked },
    }),
    enabled: body !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    // Said in the planner's own words below its ask, not as a problem.
    meta: { silent: true },
  });
  const streamed = data ?? { ...START, asked };
  const state: TripState = {
    ...streamed,
    asked,
    busy: isFetching,
    status: isFetching ? (streamed.status ?? (streamed.words || streamed.proposal ? null : "Reading the trip")) : null,
    error: streamed.error ?? (error && !isCancelledError(error) ? describeError(error, "The trip planner cannot be reached") : null),
    used,
  };
  const plan = (text: string) => {
    const words = text.trim();
    if (!words) return;
    // The plan's context as the Ask sends it, in the shape the trip's ask
    // types it: no airplane picked is "", the rules the assistant's own default.
    const now = contextNow();
    const context = { ...now, aircraft: now.aircraft ?? "", rules: "vfr" as const, pilot: now.pilot ? { ...now.pilot } : null };
    setUsed([]);
    setAsk((was) => ({
      body: { text: words, context, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      n: was.n + 1,
    }));
  };
  const use = (leg: TripLeg) => {
    useAsk.getState().applyChange?.(changeOf(leg));
    setUsed((u) => [...u, leg.kind]);
  };
  // Not reverted: the words and legs that came stay on the screen.
  const stop = () => void client.cancelQueries({ queryKey }, { revert: false });
  const clear = () => {
    stop();
    setAsk((was) => ({ body: null, n: was.n + 1 }));
    setUsed([]);
  };
  return { state, canUse, plan, use, stop, clear };
}
