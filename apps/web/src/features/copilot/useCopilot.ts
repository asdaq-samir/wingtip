import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { announce } from "@react-aria/live-announcer";
import { useFlying } from "../../lib/mapChrome";
import { useCopilotFlight } from "../../lib/copilot/flight";
import { copilotVoice } from "../../lib/copilot/voice";
import { useAhead } from "../../lib/map/position/ahead";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { usePreferences } from "../../lib/preferences";
import { useCurrency } from "../../lib/useCurrency";
import { alongLine, copilotInput, nightCurrent, rememberCategories, restOfRoute, watch, type CopilotMessage } from "./copilotInput";

/** How often the copilot looks again at where the airplane is: the
 *  engine's answer takes microseconds, but a message that changed a
 *  second ago does not need a new look every fix. */
const LOOK_MS = 3_000;
/** How often the planner is asked again for the reports round the
 *  airplane: METARs come hourly and a SPECI at any time; TFRs, SFDPS and
 *  ITWS are read live. */
const ASK_MS = 60_000;

/**
 * The in-flight copilot's state: while flying (flying mode, a GPS's
 * flight or the dry run), the one message that matters most now from the
 * engine's copilot_watch, said aloud once where the pilot asked for it.
 * Its view is CopilotBanner. Nothing is refused or held back from the
 * pilot: the engine warns, the pilot decides (the owner's rule).
 */
export function useCopilot(): { message: CopilotMessage | null; dismiss: () => void } {
  const mode = usePreferences((s) => s.copilotMode);
  const minimums = usePreferences((s) => s.minimums);
  const flying = useFlying((s) => s.flying);
  const flight = useCopilotFlight((s) => s.flight);
  const on = mode !== "off" && flying && !!flight;
  const ahead = useAhead();
  const { data: currency } = useCurrency({ enabled: on, silent: true });

  // Where to ask the planner from: rounded, so the question changes as
  // the airplane gets somewhere new, not at every fix. The rest of the
  // route starts from that same rounded place: from the fix itself, to
  // restOfRoute's few hundred metres, the question changed every 0.3 nm,
  // a fifth of a second at the dry run's 50 times, each ask overtaken
  // before its answer came, and with no answer ever kept
  // (keepPreviousData keeps only one shown) the copilot said nothing for
  // the whole flight (copilot.spec on CI's runner, four runs of PR #591).
  const ask = useOwnShip((s) => {
    const fix = s.enabled ? s.fix : null;
    if (!on || !fix || !flight) return null;
    const along = alongLine(fix, flight.line);
    const at = { lat: Math.round(fix.lat * 10) / 10, lon: Math.round(fix.lon * 10) / 10 };
    return JSON.stringify({
      ...at,
      dest: flight.dest,
      ...(flight.alternate ? { alternate: flight.alternate } : {}),
      path: restOfRoute(at, flight.line, along?.leg ?? 0),
    });
  });
  const { data: around } = useQuery({
    queryKey: ["copilot-around", ask],
    queryFn: () => api.copilotAround(JSON.parse(ask!)),
    enabled: !!ask,
    placeholderData: keepPreviousData,
    staleTime: ASK_MS / 2,
    refetchInterval: ASK_MS,
    // A copilot that cannot read says nothing; the alerts banner says
    // when the planner does not answer.
    meta: { silent: true },
  });

  const [message, setMessage] = useState<CopilotMessage | null>(null);
  const firstSeen = useRef<Record<string, string | null>>({});
  const startedAt = useRef<number | null>(null);
  const said = useRef(new Set<string>());
  const dismissed = useRef(new Set<string>());
  // What the next look reads, the latest of each: the look is not set
  // going again as each changes. useAhead's answer is a new object at
  // each render, and the copilot renders at each new place asked from,
  // several times a second in a dry run at 50 times; the look's timers,
  // cleared and set again at each, never came round on a slow CPU, and
  // the copilot said nothing for a whole flight (copilot.spec on CI's
  // runner, three runs of PR #591, and 3 of 3 on one CPU).
  const latest = useRef({ mode, flight, around, ahead, minimums, currency });
  const pending = useRef<number | null>(null);

  const look = useRef(() => {
    const { mode, flight, around, ahead, minimums, currency } = latest.current;
    const fix = useOwnShip.getState().fix;
    if (fix && startedAt.current == null) startedAt.current = fix.at;
    const input = copilotInput({
      fix,
      flight,
      around,
      ahead: ahead?.alerts ?? [],
      minimums,
      nightCurrent: fix ? nightCurrent(currency, fix.at / 1000) : null,
      startedAtMs: startedAt.current,
      firstSeen: firstSeen.current,
    });
    const answer = input ? watch(input) : null;
    const first = answer?.messages.find((m) => !dismissed.current.has(m.id)) ?? null;
    setMessage((prev) => (prev?.id === first?.id && prev?.title === first?.title ? prev : first));
    // Said once a message, and only the copilot's own: the alerts
    // banner speaks what is ahead.
    if (first && !first.elsewhere && !said.current.has(first.id)) {
      said.current.add(first.id);
      if (mode === "spoken") {
        if (first.level === "warning") copilotVoice().interrupt(first.say);
        else copilotVoice().say(first.say);
      } else {
        // Told to a screen reader instead, once, in the words a voice
        // reads (lib/announce): the banner arriving whole is not.
        announce(first.say, first.level === "warning" ? "assertive" : "polite");
      }
    }
  });

  // Every few seconds while flying, on one timer for the flight: the look
  // sets the message from the timer, as an outside store's change sets
  // state.
  useEffect(() => {
    if (!on) {
      // The next flight starts afresh: its first categories, its fuel.
      firstSeen.current = {};
      startedAt.current = null;
      said.current.clear();
      dismissed.current.clear();
      return;
    }
    const timer = window.setInterval(() => look.current(), LOOK_MS);
    return () => {
      window.clearInterval(timer);
      if (pending.current != null) window.clearTimeout(pending.current);
      pending.current = null;
    };
  }, [on]);

  // And at once when what it reads changes: one look waiting at a time,
  // reading what is latest when it comes, never put off by the next change.
  useEffect(() => {
    latest.current = { mode, flight, around, ahead, minimums, currency };
    if (!on) return;
    if (around) firstSeen.current = rememberCategories(firstSeen.current, around);
    pending.current ??= window.setTimeout(() => {
      pending.current = null;
      look.current();
    }, 0);
  }, [on, mode, flight, around, ahead, minimums, currency]);

  const shown = on ? message : null;
  const dismiss = () => {
    if (!shown) return;
    dismissed.current.add(shown.id);
    setMessage(null);
  };
  return { message: shown, dismiss };
}
