import KeptAge from "../../components/KeptAge";
import { cn } from "cn";
import AccordionSection from "../../components/AccordionSection";
import { TEXT } from "../../lib/text";
import { AltitudeReasoning } from "../navlog/lazy";
import { clockTime } from "../plan";
import { useFlightBriefing } from "./useFlightBriefing";
import { briefingPendingMessage } from "./briefingFigures";
import { TakeoffLandingSection } from "./PreflightSections";
import AirportSections from "./AirportSectionsPart";
import WeatherAlongRoute from "./WeatherAlongRoute";
import AlternateSection from "./AlternateSection";
import { Pending } from "./BriefingBits";
import PreflightPart from "./PreflightPart";
import EnroutePart from "./EnroutePart";
import { WORDING } from "../../lib/wording/generated/wording";
import type { BriefingViewProps } from "./FlightBriefingView";

const NO_STOPS: string[] = [];

/**
 * One of the Brief's pages (FlightBriefingView's `part`), on a chunk of its
 * own with the Brief's card (briefPages): drawn only in the Brief's card and
 * on paper, never as a route link first draws, which loads only the
 * publishing instance (useBriefingModel) of FlightBriefingView.
 */
export default function BriefingPage(props: BriefingViewProps) {
  const { part, nav, legs, dep, dest, stops = NO_STOPS, course = null, totals = null, depart = "", briefing: briefingState } = props;
  const page = useFlightBriefing(props);
  if (part === null) return null;
  // Not yet worked out (the publishing instance's first render): the
  // part's shape, as a briefing on its way.
  if (!page) return <Pending coming>{briefingPendingMessage(briefingState)}</Pending>;
  const vm = page;
  const {
    briefing,
    briefingPendingMessage: pendingLine,
    briefingComing,
    unchecked,
    opened,
    landings,
    ownCallSign,
    loaded,
    ifr,
    alternateWhere,
  } = vm;

  return (
    // No header, title or scroller of its own: the planning panel's tabs
    // (NavLogView) hold the nav log's own and these, one part to a tab --
    // laid open (SectionsOpen) -- and every part, one after another, for
    // the printer.
    <>
      {briefingState.state === "ready" && briefingState.refreshError && (
        // The last briefing stays up after a refresh that failed -- say
        // so, and how old it is, as the map's airport chips do.
        <p className={cn("border-b py-2 text-caution-ink print:hidden", TEXT.prose)}>
          Could not refresh the briefing ({briefingState.refreshError}); showing the one fetched at{" "}
          {clockTime(new Date(briefingState.fetchedAt))}.
        </p>
      )}

      {briefingState.state === "ready" && (
        // The briefing kept on this device, with its age, where it is the
        // one shown with no signal: the Go / No-Go over Preflight is worked
        // from it, so its own word there (lib/kept).
        <KeptAge
          kind={part === "preflight" ? "go_no_go" : "briefing"}
          path="/api/planner/briefing"
          atMs={briefingState.fetchedAt}
          failed={!!briefingState.refreshError}
          className="py-2 print:hidden"
        />
      )}

      {/* Preflight: the go / no-go first, then what is done before
          leaving -- the airspace, the risk, the paperwork, the loading. */}
      {part === "preflight" && <PreflightPart vm={vm} nav={nav} totals={totals} dep={dep} dest={dest} depart={depart} />}

      {/* Depart: only what leaving needs, in the order it is used -- the
          field's weather, the takeoff, then the field: its radio, its
          runways and its pattern. */}
      {part === "depart" && (
        <>
          {briefing && course ? (
            <WeatherAlongRoute
              briefing={briefing}
              course={course}
              legs={legs}
              departIso={depart || opened}
              unchecked={unchecked}
              phase="depart"
            />
          ) : (
            <AccordionSection title="Weather">
              <Pending coming={briefingComing}>{pendingLine}</Pending>
            </AccordionSection>
          )}
          <TakeoffLandingSection
            aircraft={nav?.aircraft}
            briefing={briefing}
            course={course}
            phase="depart"
            takeoff={loaded?.takeoff.weightLb ?? null}
            landing={loaded?.landing.weightLb ?? null}
          />
          {briefing ? (
            <AirportSections briefing={briefing} landings={landings} legs={legs} callSign={ownCallSign} phase="depart" />
          ) : (
            <AccordionSection title="Airport">
              <Pending coming={briefingComing}>{pendingLine}</Pending>
            </AccordionSection>
          )}
        </>
      )}

      {/* En route's first: the altitude the side view shows. */}
      {part === "profile" && (
        // The plan flown, with its time and fuel, then the floor and the
        // ceiling it was chosen within, each with its reason, and the rest
        // of how the planner got there -- a row a step, its working folded
        // under it, the steps the FL chip's popover shows (AltitudeReasoning).
        // From `nav.altitude_selection`, which arrives with the nav log.
        <AccordionSection title={WORDING.cruiseAltitude}>
          {!nav ? (
            <Pending>Waiting on the nav log&apos;s altitude…</Pending>
          ) : (
            <AltitudeReasoning nav={nav} legs={legs} winds={totals?.winds} />
          )}
        </AccordionSection>
      )}

      {/* En route, under the legs and the side view: the weather on the way
          -- adverse conditions first (AIM 7-1-5), then stretch by stretch,
          then the winds -- and any stops. */}
      {part === "enroute" && <EnroutePart vm={vm} course={course} legs={legs} depart={depart} winds={totals?.winds} />}

      {part === "enroute" && stops.length > 0 && (
        <>
          <TakeoffLandingSection
            aircraft={nav?.aircraft}
            briefing={briefing}
            course={course}
            phase="enroute"
            takeoff={loaded?.takeoff.weightLb ?? null}
            landing={loaded?.landing.weightLb ?? null}
          />
          {briefing ? (
            <AirportSections briefing={briefing} landings={landings} legs={legs} callSign={ownCallSign} phase="enroute" />
          ) : (
            <AccordionSection title="Airport">
              <Pending coming={briefingComing}>{pendingLine}</Pending>
            </AccordionSection>
          )}
        </>
      )}

      {/* Arrive: the destination when the flight gets there -- its
          weather, the landing, the field -- and under IFR the alternate. */}
      {part === "arrive" && (
        <>
          {briefing && course ? (
            <WeatherAlongRoute
              briefing={briefing}
              course={course}
              legs={legs}
              departIso={depart || opened}
              unchecked={unchecked}
              phase="arrive"
            />
          ) : (
            <AccordionSection title="Weather">
              <Pending coming={briefingComing}>{pendingLine}</Pending>
            </AccordionSection>
          )}
          <TakeoffLandingSection
            aircraft={nav?.aircraft}
            briefing={briefing}
            course={course}
            phase="arrive"
            takeoff={loaded?.takeoff.weightLb ?? null}
            landing={loaded?.landing.weightLb ?? null}
          />
          {briefing ? (
            <AirportSections briefing={briefing} landings={landings} legs={legs} callSign={ownCallSign} phase="arrive" />
          ) : (
            <AccordionSection title="Airport">
              <Pending coming={briefingComing}>{pendingLine}</Pending>
            </AccordionSection>
          )}
          {ifr && <AlternateSection {...alternateWhere} />}
        </>
      )}
    </>
  );
}
