/**
 * The Coach page's state and its calls, in one hook: the pilot's
 * logbook, dates and home field as the app already has them, the
 * certificate they hold (a menu, kept on this device), and on their ask
 * the debriefs of their recent flights, the engine's plan through the
 * planner.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import type { Currency, LogbookEntry, Training } from "../../../lib/api/types";
import { localDay } from "../../../lib/format";
import { keptStore } from "../../../lib/storage";
import { currencyQuery, pilotQuery, trainingQuery } from "../../../lib/queryClient";
import { coachApi, type CoachAsk, type ProficiencyPlan } from "./coachApi";
import { recentDebriefs } from "./coachDebriefs";

/** What the pilot holds, as the plan reads it: a student is held to the
 *  solo endorsement (61.56(g)); an instrument rating adds 61.57(c). */
export type Certificate = "student" | "private" | "instrument";
export const CERTIFICATES: { value: Certificate; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "private", label: "Private or Higher" },
  { value: "instrument", label: "Instrument Rated" },
];

/** The certificate the pilot said they hold, kept on this device in the
 *  app's persisted store (keptStore: one store for every caller, a refused
 *  or full storage kept for the visit). */
const KEY = "wingtip.coach.certificate";
/** Made once here, named as the hook it is: made inside useCoach, the React
 *  Compiler took keptStore for a plain call and memoised the store's
 *  selector hook with it, so a render that reused the memo called one hook
 *  fewer and React threw (#311) as the plan came in. */
const useKeptCertificate = keptStore<Certificate | null>(KEY, null);
const isCertificate = (v: unknown): v is Certificate => CERTIFICATES.some((c) => c.value === v);

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
  const chosen = useKeptCertificate((s) => s.value);
  const certificate = isCertificate(chosen) ? chosen : guessed(entries.data, currency, training);
  const choose = (c: Certificate) => useKeptCertificate.setState({ value: c });

  const plan = useMutation({
    mutationFn: async (): Promise<ProficiencyPlan> => {
      const debriefs = await recentDebriefs().catch(() => []);
      return coachApi.plan(askOf(entries.data ?? [], currency, training, certificate, pilot?.homeBase ?? null, debriefs, localDay()));
    },
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
  };
}
