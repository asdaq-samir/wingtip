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
import { useRef, useState } from "react";
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

async function planTrip(body: TripAsk, onEvent: (event: TripMessage) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch("/api/planner/trip-plan", {
    method: "POST",
    signal,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson", ...csrfHeaders("POST"), ...requestIdHeaders() },
  });
  if (res.status === 401) throw new ApiError("Sign in to plan a trip", 401);
  await failIfNotOk(res);
  for await (const event of ndjson<TripMessage>(res.body ?? undefined)) {
    onEvent(event);
    if (event.type === "done" || event.type === "error") return;
  }
}

export function useTripPlanner() {
  const [state, setState] = useState<TripState>(START);
  const inFlight = useRef<AbortController | null>(null);
  const canUse = useAsk((s) => s.applyChange !== null);
  const plan = async (text: string) => {
    const asked = text.trim();
    if (!asked) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ ...START, asked, busy: true, status: "Reading the trip" });
    // The plan's context as the Ask sends it, in the shape the trip's ask
    // types it: no airplane picked is "", the rules the assistant's own default.
    const now = contextNow();
    const context = { ...now, aircraft: now.aircraft ?? "", rules: "vfr" as const, pilot: now.pilot ? { ...now.pilot } : null };
    try {
      await planTrip(
        { text: asked, context, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        (event) => setState((s) => step(s, event)),
        controller.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setState((s) => ({ ...s, status: null, error: describeError(err, "The trip planner cannot be reached") }));
      }
    }
    setState((s) => ({ ...s, busy: false, status: null }));
  };
  const use = (leg: TripLeg) => {
    useAsk.getState().applyChange?.(changeOf(leg));
    setState((s) => ({ ...s, used: [...s.used, leg.kind] }));
  };
  const stop = () => inFlight.current?.abort();
  const clear = () => {
    stop();
    setState(START);
  };
  return { state, canUse, plan, use, stop, clear };
}
