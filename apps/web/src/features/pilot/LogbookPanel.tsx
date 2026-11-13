import { lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Mail, MailX, Target, Users } from "lucide-react";
import { cn } from "cn";
import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { DateField as StockDateField } from "../../components/ui/date-field";
import TogglePill from "../../components/TogglePill";
import { api } from "../../lib/api/client";
import type { Currency } from "../../lib/api/types";
import CheckridePage from "./CheckridePage";
import InstructorPage from "./InstructorPage";
import ComingUp from "./ComingUp";
import LogbookFile from "./LogbookFile";
import { localDay } from "../../lib/format";
import { said } from "../../lib/endorsements";
import { FINDING_TONE } from "../../lib/findings";
import { currencyQuery, trainingQuery } from "../../lib/queryClient";
import LogbookFlights from "./logbook/LogbookFlights";
import { refreshLogbook } from "./logbook/logbookEntry";

const today = () => localDay();
// Its own chunk: it reads the saved flights' debriefs only when opened.
const CoachPage = lazy(() => import("./coach/CoachPage"));

/** "To 19 Dec 2026" in the tint's green, or "Not current" in red; with a
 *  `from` still to come (instrument currency from approaches flown this
 *  month, 61.57(c)(1)), "From 1 Nov 2026" in amber, as not current yet. */
function Until({ date, from, what }: { date: string | null | undefined; from?: string | null; what: string }) {
  const current = !!date && date >= today();
  const notYet = current && from && from > today() ? from : null;
  return (
    <span
      className={cn("tabular-nums", notYet ? FINDING_TONE.caution : current ? FINDING_TONE.ok : FINDING_TONE.stop)}
      data-testid={`currency-${what}`}
    >
      {!date ? "Not current" : notYet ? `From ${said(notYet)}` : current ? `To ${said(date)}` : `Ended ${said(date)}`}
    </span>
  );
}

/** A date the pilot gives (the flight review's, the medical's expiry),
 *  saved as it changes. */
function DateField({
  value,
  label,
  onChange,
  testId,
}: {
  value: string | null | undefined;
  label: string;
  onChange: (v: string | null) => void;
  testId: string;
}) {
  return (
    <StockDateField
      aria-label={label}
      value={value ?? ""}
      className="h-8 w-40"
      data-testid={testId}
      onChange={(day) => onChange(day || null)}
    />
  );
}

/**
 * The pilot's logbook and their currency, the Library's Logbook:
 * where they stand first -- passengers by day and at night (14 CFR
 * 61.57), the flight review (61.56) and the medical, with the two dates
 * they give, and instrument currency (61.57(c)) with the last proficiency
 * check -- then the totals and the flights, newest first
 * (logbook/LogbookFlights: each changed in its own row).
 */
export function LogbookPanel({ aircraft }: { aircraft?: string }) {
  const queryClient = useQueryClient();
  // The file's export reads the flights too (LogbookFlights' own query).
  const { data: entries } = useQuery({ queryKey: ["logbook"], queryFn: api.logbook.list, meta: { silent: true } });
  const { data: currency } = useQuery(currencyQuery);
  const { data: training } = useQuery(trainingQuery);
  const refresh = () => void refreshLogbook(queryClient);
  const dates = useMutation({
    mutationFn: (next: { flightReviewOn: string | null; medicalExpiresOn: string | null; ipcOn: string | null }) =>
      api.logbook.setCurrencyDates(next),
    onSuccess: (c: Currency) => {
      queryClient.setQueryData(["currency"], c);
      void queryClient.invalidateQueries({ queryKey: ["paperwork"] });
    },
  });
  // Emailed 30 and 7 days before each of these runs out (ReminderService),
  // at the pilot's ask.
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.logbook.reminders });
  const remind = useMutation({
    mutationFn: (on: boolean) => api.logbook.setReminders(on),
    onSuccess: (r) => queryClient.setQueryData(["reminders"], r),
  });
  const reviewOn = currency?.flightReviewOn ?? null;
  const medicalOn = currency?.medicalExpiresOn ?? null;
  const ipcOn = currency?.ipcOn ?? null;
  // The dates given, each changed on its own.
  const setDates = (change: Partial<{ flightReviewOn: string | null; medicalExpiresOn: string | null; ipcOn: string | null }>) =>
    dates.mutate({ flightReviewOn: reviewOn, medicalExpiresOn: medicalOn, ipcOn, ...change });
  // Lapsed more than six calendar months: only a check restores it (61.57(d)).
  const ipcNeeded = !!currency?.ipcNeededAfter && currency.ipcNeededAfter < today();
  const met = training?.experience.filter((i) => i.met).length ?? 0;
  return (
    <ConsolePages
      back="Logbook"
      pages={{
        checkride: { title: "Private pilot checkride", content: <CheckridePage /> },
        instructing: { title: "Instructing", content: <InstructorPage /> },
        coach: {
          title: "Coach",
          content: (
            <Suspense fallback={null}>
              <CoachPage />
            </Suspense>
          ),
        },
      }}
    >
      <section aria-label="Logbook" className="space-y-5">
        <ListGroup>
          {/* What is due, what the pilot's own flights show and what to
            practise, the engine's plan in words (coach/CoachPage). */}
          <PageRow
            page="coach"
            title="Coach"
            media={<Target className="size-5 text-tint" />}
            description="What is due, what your flights show, and what to practise where"
            testId="coach-row"
          />
          <PageRow
            page="checkride"
            title="Checkride"
            media={<GraduationCap className="size-5 text-tint" />}
            description="61.109 experience, knowledge test codes, endorsements, your instructor"
            value={training ? `${met} of ${training.experience.length}` : undefined}
          />
          {/* A flight instructor's students, their reviews and what they
            signed (InstructorPage): for anyone to set up, as a student
            asks an instructor in by address. */}
          <PageRow
            page="instructing"
            title="Instructing"
            media={<Users className="size-5 text-tint" />}
            description="Your students, their solo cross-countries and the endorsements you sign"
          />
        </ListGroup>
        {/* What falls due, the pilot's and their airplanes', soonest first
          (ComingUp): what the reminders below email about. */}
        <ComingUp />

        {/* From the logbook and the two dates above it, no one's sign-off: 61.57
          counts takeoffs and landings in the same category and class; at
          night, to a full stop. */}
        <ListGroup title="Currency">
          <ListRow title="Passengers by day" description="3 takeoffs and landings in 90 days">
            <Until date={currency?.dayPassengersUntil} what="day" />
          </ListRow>
          <ListRow title="Passengers at night" description="3 to a full stop at night in 90 days">
            <Until date={currency?.nightPassengersUntil} what="night" />
          </ListRow>
          <ListRow
            title="Flight review"
            description={
              currency?.flightReviewUntil ? <Until date={currency.flightReviewUntil} what="review" /> : "Within 24 calendar months"
            }
          >
            <DateField
              value={reviewOn}
              label="Flight review date"
              testId="flight-review-date"
              onChange={(v) => setDates({ flightReviewOn: v })}
            />
          </ListRow>
          <ListRow title="Medical" description={medicalOn ? <Until date={medicalOn} what="medical" /> : "The day it expires"}>
            <DateField
              value={medicalOn}
              label="Medical expires"
              testId="medical-date"
              onChange={(v) => setDates({ medicalExpiresOn: v })}
            />
          </ListRow>
          <ListRow title="Reminders" description="An email 30 and 7 days before each runs out, your airplanes' too">
            <TogglePill
              pressed={!!reminders?.on}
              onPressedChange={(on) => remind.mutate(on)}
              disabled={!reminders || remind.isPending}
              icon={reminders?.on ? <Mail /> : <MailX />}
              label="Email"
              testId="reminders-toggle"
            />
          </ListRow>
        </ListGroup>

        {/* Instrument currency (14 CFR 61.57(c), (d)), from the approaches,
          holding and tracking logged with each flight, and the last check. */}
        {/* Six approaches, holding and tracking in the 6 calendar months
          before the month flown, actual or simulated; more than six months
          past, only an instrument proficiency check restores it. */}
        <ListGroup title="Instrument">
          <ListRow
            title="Instrument currency"
            description={`${currency?.approachesInWindow ?? 0} of 6 approaches${currency?.holdingInWindow ? ", holding" : ""}${currency?.trackingInWindow ? ", tracking" : ""} in the window`}
          >
            {ipcNeeded ? (
              <span className={FINDING_TONE.stop} data-testid="currency-instrument">
                IPC needed
              </span>
            ) : (
              <Until date={currency?.instrumentCurrentUntil} from={currency?.instrumentCurrentFrom} what="instrument" />
            )}
          </ListRow>
          <ListRow title="Proficiency check" description={ipcOn ? `On ${said(ipcOn)}` : "The day of your last IPC"}>
            <DateField value={ipcOn} label="Instrument proficiency check date" testId="ipc-date" onChange={(v) => setDates({ ipcOn: v })} />
          </ListRow>
        </ListGroup>

        {currency && currency.flights > 0 && (
          <ListGroup title="Totals">
            <ListRow title="Total" value={`${currency.totalHours.toFixed(1)} h`} />
            <ListRow title="Night" value={`${currency.nightHours.toFixed(1)} h`} />
            <ListRow title="Cross-country" value={`${currency.crossCountryHours.toFixed(1)} h`} />
            <ListRow title="Landings" value={currency.landings} />
          </ListGroup>
        )}

        {/* To and from a CSV file, its flights shown before they go in
          (LogbookFile). */}
        <LogbookFile entries={entries} onImported={refresh} />

        <LogbookFlights aircraft={aircraft} />
      </section>
    </ConsolePages>
  );
}
