import { memo, Suspense } from "react";
import { cn } from "cn";
import { CloudOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { TEXT } from "../../lib/text";
import type { Course, Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import type { BriefingState, BriefingPart } from "../plan";
import { useBriefingModel } from "./useBriefingModel";
import { WEATHER_SOURCE_LABEL, briefingPendingMessage } from "./briefingFigures";
import type { FiledProcedure } from "./flightPlanForm";
import { Pending } from "./BriefingBits";
import { BriefingPageChunk } from "./briefPagesChunk";

export interface BriefingViewProps {
  /** Which of the panel's tabs this is drawn in: its sections only; null,
   *  nothing drawn -- the one kept out of the tabs that `publish`es. */
  part: BriefingPart | null;
  /** Publishes the risk assessment (useRisk) for Save and the Brief tab's
   *  mark. One instance, outside the tabs: each tab's own, hidden and shown
   *  under Activity, cleared it and set it again on every switch, and the
   *  whole panel drew again with each. */
  publish?: boolean;
  nav: NavLogAltitude | null;
  legs: Leg[];
  dep: string;
  dest: string;
  /** The airports landed at on the way, in order. */
  stops?: string[];
  /** Every stop as the route has it, flown through or landed at, airways
   *  among them: the flight plan's route. */
  route?: string[];
  /** The departure and the arrival picked at the route's ends, for the
   *  flight plan's route under IFR. */
  procedures?: { departure: FiledProcedure | null; arrival: FiledProcedure | null };
  /** The course, for the airports' elevations, and the trip's totals,
   *  for the fuel burned by the landing (Weight & Balance). */
  course?: Course | null;
  totals?: Totals | null;
  /** The departure time picked, ISO; empty for now. For when the flight
   *  passes each TFR and special-use area. */
  depart?: string;
  /** Where the briefing stands (see `usePlan`'s BriefingState). The
   *  page keeps its standard sections visible and says which state
   *  applies, rather than making a failed briefing indistinguishable
   *  from a slow one. */
  briefing: BriefingState;
  /** No VFR altitude fits the route, in a line (usePlan's Unflyable). */
  problem?: string | null;
}

/**
 * The planning panel's tabs' briefing, one part to a tab (`part`), each
 * opening with its conclusion and then going place by place or check by
 * check -- the same marks (lib/findings) and the same warnings on the
 * sections' titles in every tab:
 *
 * - The Brief: the Go / No-Go over every tab's findings (lib/verdict),
 *   the TFRs and special-use airspace the route meets
 *   when it meets them, the risk assessment, and preflight action (14
 *   CFR 91.103) to tick off, with what is not fetched here -- NOTAMs, ATC
 *   delays -- as links to where a pilot gets them.
 * - The Weather: adverse conditions first, as a briefer gives them (AIM
 *   7-1-5) with VFR not recommended and the pilot's own minimums; then
 *   the route place by place, each forecast read for when the flight is
 *   there; then the winds aloft.
 * - The Performance: the runway check at each field, then the weight
 *   and balance that changes it.
 * - The Airports: a section for each field, in the order flown.
 * - Under the Nav Log's profile, its Cruise Altitude.
 *
 * Not a page or a scroller of its own: the panel scrolls each tab, and
 * on paper every part is laid out one after another. A synoptic
 * narrative, the one element of a standard briefing not here, needs a
 * meteorologist's analysis, not a data fetch.
 *
 * The view only: what it shows is worked out, and published, by its view
 * model (useFlightBriefing).
 */
// Drawn again only when its plan changes (memo): every tab is one of
// these, and the page draws again at every row picked in the nav log.
// The pages are on a chunk of their own with the Brief's card
// (briefPagesChunk), drawn only in the card and on paper; a route link
// draws the publishing instance alone, and loads none of them.
export default memo(function FlightBriefingView(props: BriefingViewProps) {
  if (props.publish) return <BriefingPublisher {...props} />;
  if (props.part === null) return null;
  return (
    // The part's shape while its chunk comes, as a briefing on its way.
    <Suspense fallback={<Pending coming>{briefingPendingMessage(props.briefing)}</Pending>}>
      <BriefingPageChunk {...props} />
    </Suspense>
  );
});

/** The one instance that works the briefing out, for every page. */
function BriefingPublisher(props: BriefingViewProps) {
  useBriefingModel(props);
  return null;
}

/**
 * Which weather sources the briefing could not check, above every
 * section of the flight planning drawer (NavLogView's `notice`): what
 * the briefing did not see is seen on opening the drawer, and on the
 * printed page. It was a toast, gone in ten seconds and stacked behind
 * the planning-aid reminder. (VFR-not-recommended is stated in Current
 * Conditions, and flagged on its title.)
 */
export function BriefingNotices({ briefing: state }: { briefing: BriefingState }) {
  const briefing = state.state === "ready" ? state.data : null;
  const gaps = briefing?.weather_unavailable.map((source) => WEATHER_SOURCE_LABEL[source]) ?? [];
  if (gaps.length === 0) return null;
  return (
    <div className="pt-3" data-testid="briefing-notices">
      <Alert className={cn("border-caution/30 bg-caution-wash text-caution-ink", TEXT.prose)}>
        <CloudOff />
        <AlertTitle>Could not check {gaps.join(", ")}</AlertTitle>
        <AlertDescription className={cn("text-caution-ink", TEXT.prose)}>
          aviationweather.gov did not answer. Verify them separately before flight.
        </AlertDescription>
      </Alert>
    </div>
  );
}
