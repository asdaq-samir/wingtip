import { useMemo } from "react";
import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Check, GraduationCap, Save } from "lucide-react";
import { done } from "../../../../lib/doneNote";
import { DropdownMenuItem } from "../../../../components/ui/dropdown-menu";
import { ResponsivePopoverContent } from "../../../../components/ResponsivePopover";
import { ReviewAskForm, type ReviewAsk } from "../../../../components/ReviewAsk";
import { localDay } from "../../../../lib/format";
import { TEXT } from "../../../../lib/text";
import { api } from "../../../../lib/api/client";
import { pilotQuery, trainingQuery } from "../../../../lib/queryClient";
import type { SaveFlightRequest } from "../../../../lib/api/types";
import { FINDING_TONE } from "../../../../lib/findings";
import { planOf, SAVE_FLIGHT, useSaveRequest } from "./saveFlightRequest";
import type { FlightToSave } from "../../../../lib/briefPlan";
import { Spinner } from "../../../../components/ui/spinner";
import { FieldError } from "../../../../components/ui/field";

/**
 * "Save this flight" -- files the nav log Spring Boot already has a
 * schema for (`flights`/`flight_checkpoints`) but, until this, no
 * caller ever populated. Not a print-page concern; this reads/writes
 * `/api/aircraft` and `/api/flights` directly (same Spring Boot
 * origin, same pattern the account panels use), independent
 * of planner entirely. Hidden while signed out rather than
 * shown disabled -- there is nothing a signed-out pilot could do
 * about it from here, and a disabled button with no explanation reads
 * as broken rather than as "sign in first."
 *
 * An item of the route's Share menu (PlanWorkspace puts it there, at the
 * pilot's ask, with Print and the rest: beside the chips only the
 * Approaches and Share), its state its glyph and its name: Save,
 * Saving…, Saved; said in a note once saved, the menu having gone. It
 * was a round button beside Share and Print, and before that a line of
 * its own at the head of the sections, with the airplane the flight would be filed
 * in spelled out beside it; that airplane is the header's own picker, a
 * line above.
 */
export function SaveFlightButton(flight: FlightToSave) {
  const queryClient = useQueryClient();
  // The one ["pilot"] query the console and the header share: signed out
  // after a Log out, back after a failed check is retried. A private
  // one-shot lookup here used to hide the section for the session after
  // one failed check, and keep offering Save after a Log out.
  const { data: pilot } = useQuery(pilotQuery);
  const request = useSaveRequest(flight);

  // Kept by the query client, not the item: the menu's content goes when
  // the menu closes, and with a mutation of the item's own the menu
  // opened again offered Save for a plan just saved -- a second click
  // filed it twice.
  const save = useMutation({
    mutationKey: SAVE_FLIGHT,
    mutationFn: api.flights.save,
    // The pilot console's list of flights, which it keeps; said in a
    // note, the menu it was saved from having gone.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["flights"] });
      done("Flight Saved");
    },
  });
  // "Saved" belongs to the plan that was saved: another route, time,
  // airplane or altitude is a new request, and Save is offered again.
  // It used to stay "Saved" for the session, and a click filed a
  // duplicate of whatever was on screen by then. The same plan with its
  // risk assessment made again is not another: the briefing is asked for
  // again with the flight's time en route once the nav log has it, a
  // second or two after Save is offered, and "Saved" went back to Save.
  const plan = useMemo(() => request && planOf(request), [request]);
  const filedPlans = useMutationState({
    filters: { mutationKey: SAVE_FLIGHT, status: "success" },
    select: (m) => planOf(m.state.variables as SaveFlightRequest),
  });
  const saving = useIsMutating({ mutationKey: SAVE_FLIGHT }) > 0;
  const saved = !!plan && filedPlans.includes(plan);

  if (!pilot) return null;

  return (
    <DropdownMenuItem
      onClick={() => request && save.mutate(request)}
      disabled={!request || saving || saved}
      data-testid="save-flight-button"
    >
      {saving ? <Spinner aria-hidden /> : saved ? <Check /> : <Save />}
      {saving ? "Saving…" : saved ? "Saved" : "Save this flight"}
    </DropdownMenuItem>
  );
}

/**
 * "Ask for a solo cross-country review", an item of the route's Share
 * menu beside Save: for a student whose instructor has taken them on
 * (CheckridePage), once there is a whole plan to file. It opens the sheet
 * (ReviewAskSheet) the menu's own state keeps, the menu having gone.
 */
export function ReviewAskItem({ flight, onAsk }: { flight: FlightToSave; onAsk: () => void }) {
  const { data: pilot } = useQuery(pilotQuery);
  const { data: training } = useQuery({ ...trainingQuery, enabled: !!pilot });
  const request = useSaveRequest(flight);
  if (!pilot || !training?.instructors.some((l) => l.accepted)) return null;
  return (
    <DropdownMenuItem disabled={!request} onClick={onAsk} data-testid="ask-review">
      <GraduationCap />
      Ask for a solo cross-country review
    </DropdownMenuItem>
  );
}

/**
 * The review asked from the route itself: the plan on screen saved as a
 * flight -- with Save's own mutation, so Save says Saved after -- and put
 * to the instructor chosen, as a saved flight's page puts one
 * (ReviewAskForm), for 14 CFR 61.93(c)(3)'s review of its planning.
 */
export function ReviewAskSheet({ flight, onDone }: { flight: FlightToSave; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: training } = useQuery(trainingQuery);
  const request = useSaveRequest(flight);
  const save = useMutation({ mutationKey: SAVE_FLIGHT, mutationFn: api.flights.save });
  // The flights saved this session, by their plan: one already saved is
  // asked about as it is, not filed again.
  const filed = useMutationState({
    filters: { mutationKey: SAVE_FLIGHT, status: "success" },
    select: (m) => ({ plan: planOf(m.state.variables as SaveFlightRequest), id: (m.state.data as { id: number }).id }),
  });
  const ask = useMutation({
    mutationFn: async (a: ReviewAsk) => {
      const plan = planOf(request!);
      const flightId = filed.find((f) => f.plan === plan)?.id ?? (await save.mutateAsync(request!)).id;
      return api.training.askReview({ flightId, ...a });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["training"], next);
      void queryClient.invalidateQueries({ queryKey: ["flights"] });
      done("Sent to Your Instructor");
      onDone();
    },
  });
  const theirs = training?.instructors.filter((l) => l.accepted) ?? [];
  return (
    <ResponsivePopoverContent
      title="Solo cross-country review"
      align="end"
      className="w-96 max-w-[calc(100vw-2rem)] p-3"
      data-testid="review-sheet"
      description="Your instructor reviews its planning and the weather, and endorses it for the airplane and the day (14 CFR 61.93(c)(3), (d))."
    >
      <div className="space-y-3">
        <ReviewAskForm
          instructors={theirs}
          pending={ask.isPending || !request}
          onAsk={(a) => ask.mutate(a)}
          initialDay={localDay(flight.depart ? new Date(flight.depart) : new Date())}
        />
        {ask.error && (
          <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)} data-testid="review-problem">
            {ask.error.message}
          </FieldError>
        )}
      </div>
    </ResponsivePopoverContent>
  );
}
