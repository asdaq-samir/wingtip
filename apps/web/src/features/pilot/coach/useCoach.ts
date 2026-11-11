/**
 * The Coach page's state and its calls, in one hook: the pilot's
 * logbook, dates and home field as the app already has them, the
 * certificate they hold (a menu, kept on this device), and on their ask
 * the debriefs of their recent flights, the engine's plan through the
 * planner, then the plan in words from the assistant. The plan is the
 * engine's; the words come after it and never hold it up.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import type { Currency, LogbookEntry, Training } from "../../../lib/api/types";
import { localDay } from "../../../lib/format";
import { currencyQuery, pilotQuery, trainingQuery } from "../../../lib/queryClient";
import { coachApi, type CoachAsk, type ProficiencyPlan } from "./coachApi";
import { useClaudeOn } from "../../../lib/subscription";
import { recentDebriefs } from "./coachDebriefs";

/** What the pilot holds, as the plan reads it: a student is held to the
 *  solo endorsement (61.56(g)); an instrument rating adds 61.57(c). */
export type Certificate = "student" | "private" | "instrument";
export const CERTIFICATES: { value: Certificate; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "private", label: "Private or Higher" },
  { value: "instrument", label: "Instrument Rated" },
];

const KEY = "wingtip.coach.certificate";

function stored(): Certificate | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return CERTIFICATES.some((c) => c.value === v) ? (v as Certificate) : null;
  } catch {
    return null;
  }
}

/** The certificate a pilot most likely holds, until they say: a student
 *  with endorsements on file, instrument where a check or an approach is
 *  logged, else private. */
export function guessed(entries: LogbookEntry[] | undefined, currency: Currency | undefined, training: Training | undefined): Certificate {
  if (training?.endorsements.length) return "student";
  if (currency?.ipcOn || entries?.some((e) => (e.approaches ?? 0) > 0)) return "instrument";
  return "private";
}

/** The plan's ask from what the app holds. */
export function askOf(
  entries: LogbookEntry[],
  currency: Currency | undefined,
  training: Training | undefined,
  certificate: Certificate,
  home: string | null,
  debriefs: CoachAsk["debriefs"],
  today: string,
): CoachAsk {
  const ratings: CoachAsk["ratings"] =
    certificate === "student" ? ["student"] : certificate === "instrument" ? ["private", "instrument"] : ["private"];
  return {
    today,
    entries,
    ratings,
    home,
    debriefs,
    flightReviewOn: currency?.flightReviewOn ?? null,
    medicalExpiresOn: currency?.medicalExpiresOn ?? null,
    ipcOn: currency?.ipcOn ?? null,
    held: certificate === "student" ? (training?.endorsements ?? []).map((e) => ({ code: e.code, on: e.endorsedOn })) : [],
  };
}

export function useCoach() {
  const entries = useQuery({ queryKey: ["logbook"], queryFn: api.logbook.list, meta: { silent: true } });
  const { data: currency } = useQuery(currencyQuery);
  const { data: training } = useQuery(trainingQuery);
  const { data: pilot } = useQuery(pilotQuery);
  const [chosen, setChosen] = useState<Certificate | null>(stored);
  const certificate = chosen ?? guessed(entries.data, currency, training);
  const choose = (c: Certificate) => {
    setChosen(c);
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      /* kept for this visit only */
    }
  };

  const plan = useMutation({
    mutationFn: async (): Promise<ProficiencyPlan> => {
      const debriefs = await recentDebriefs().catch(() => []);
      return coachApi.plan(askOf(entries.data ?? [], currency, training, certificate, pilot?.homeBase ?? null, debriefs, localDay()));
    },
  });
  // The words follow the plan they were asked of, and are asked once --
  // only where Claude is on (lib/subscription): the plan's own lines stand alone.
  const claude = useClaudeOn();
  const words = useQuery({
    queryKey: ["coach-words", plan.data],
    queryFn: ({ signal }) => coachApi.words(plan.data!, signal),
    enabled: claude && !!plan.data,
    staleTime: Infinity,
    retry: false,
    meta: { silent: true },
  });

  return {
    ready: !!entries.data,
    certificate,
    choose,
    home: pilot?.homeBase ?? null,
    make: () => plan.mutate(),
    making: plan.isPending,
    problem: plan.error,
    plan: plan.data ?? null,
    words: words.data ?? null,
    wording: words.isFetching,
  };
}
