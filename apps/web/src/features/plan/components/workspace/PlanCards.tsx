import type { ComponentProps, ReactNode } from "react";
import FlightFoot from "./FlightFoot";
import { routeName } from "../../../../lib/identSchema";
import type { FlightRules } from "../../../../lib/preferences";
import { Shown, useShown } from "../../../../lib/shown";
import Segmented from "../../../../components/Segmented";
import ProfileCard from "../ProfileCard";
import { BriefCard, StopsCard, DryRunControls } from "../../routePanelParts";
import { CardLayer } from "../../../../components/sheet/CardLayer";
import { useOpenedOnce } from "../../../../components/sheet/useOpenedOnce";
import ProfileLine from "./ProfileLine";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import ProfileSideView from "./ProfileSideView";
import Waits from "./Waits";
import { STOPS_CARD } from "../../hooks/useFplCards";

/** The flight rules a route is planned under, as the Profile card's switch
 *  offers them. */
const FLIGHT_RULES = [
  { value: "vfr", label: "VFR" },
  { value: "ifr", label: "IFR" },
];

/**
 * FPL's cards over the sheet, each its own nested drawer (CardLayer; the
 * owner, 2026-11-11: pages are cards): the Brief, the Nav Log, the Profile
 * and the Stops, each its own size, grabber and ✕. The Nav Log, the
 * Profile and the Stops are kept between their openings (CardLayer's
 * `open`), built once.
 *
 * Mounted beside the sheet's pages, not in FPL's (PlanPage), as in flight
 * the sheet draws no pages (MapPanel's `flying`): inside the page, a dry
 * run started from the Profile took the card, and with it the run's
 * controls -- pause, step, stop -- away the moment the airplane flew, and
 * Done flying, its foot's (docs/design/rules.md, the card rules' 12), with
 * them. Out of sight under a place's card, as the page was (TabKept).
 */
export default function PlanCards({
  vm,
  navLogCard,
  briefContents,
  briefNotice,
}: {
  vm: PlanWorkspaceModel;
  /** The Nav Log card's legs (useNavLogs). */
  navLogCard: ReactNode;
  briefContents: ComponentProps<typeof BriefCard>["contents"];
  briefNotice: ReactNode;
}) {
  const { flightRules, planned, routeKey, routed, setFlightRules } = vm.route;
  const { course, s } = vm.plan;
  const { cardUp, selectPlace } = vm.cards;
  const { addStopField } = vm.stops;
  const {
    briefHere,
    closeBrief,
    closeProfileCard,
    closeStops,
    navLogShown,
    profileShown,
    setStopsScope,
    showLegs,
    stopsAt,
    stopsShown,
    stopsRoute,
    stopsScope,
  } = vm.fpl;
  const { dryRunning, goMissed, goMissedNow, stopDryRun } = vm.flight;
  const { briefLine, marks, profileCautions } = vm.brief;
  // Each card drawn from its first opening on, then kept (CardLayer).
  const navLogDrawn = useOpenedOnce(navLogShown);
  const profileDrawn = useOpenedOnce(profileShown);
  const stopsDrawn = useOpenedOnce(stopsShown);
  const shown = useShown() && !cardUp;
  return (
    <Shown.Provider value={shown}>
      {/* The Brief over FPL, a card of its own: the route's head and its
            figures out of sight while it is open, as an airport's card has
            them. */}
      {briefHere && (
        <BriefCard
          name={routeName(planned.dep, planned.dest, planned.stops)}
          line={briefLine}
          contents={briefContents}
          notice={briefNotice}
          marks={marks}
          onClose={closeBrief}
          onLegs={showLegs}
          route={routeKey}
        />
      )}
      {navLogDrawn && routed && (
        <CardLayer open={navLogShown}>
          {/* Its room over its head the grabber's, as every card's (SheetCard).
                The head is the whole log's own child (NavLogView): in a box of
                its own it stuck only within it and scrolled away, the title and
                ✕ gone and nothing of the card left at the pill. */}
          <div
            className="flex min-h-0 flex-1 flex-col pt-(--pinned-room) [--pinned-room:var(--corner-inset,0.75rem)] print:hidden"
            data-testid="navlog-card"
          >
            {navLogCard}
          </div>
        </CardLayer>
      )}
      {profileDrawn && routed && (
        <CardLayer open={profileShown}>
          <ProfileCard
            name="Profile"
            sub={<ProfileLine vm={vm} />}
            line={briefLine}
            onClose={closeProfileCard}
            cautions={profileCautions}
            rules={
              !s.local && (
                <Segmented
                  label="Flight rules"
                  value={flightRules}
                  onChange={(v) => setFlightRules(v as FlightRules)}
                  testId="flight-rules"
                  options={FLIGHT_RULES}
                />
              )
            }
          >
            {/* The dry run in the side view's place while it plays, the card's
                  height. */}
            {dryRunning ? (
              <Waits>
                <div className="flex min-h-0 flex-1 flex-col" data-testid="profile-dry-run">
                  <DryRunControls run={dryRunning} ends={course} onClose={stopDryRun} missed={goMissed} onMissed={goMissedNow} />
                </div>
              </Waits>
            ) : (
              <ProfileSideView vm={vm} />
            )}
            {/* The flight's figures and its way out -- the dry run's figures,
                  Done flying -- at the foot of the card in sight, not left on
                  FPL's foot under it: the native pattern, as Apple Maps'
                  navigation card carries its arrival figures and End (the
                  owner, 2026-11-12: "Just do it the native way"). */}
            {profileShown && (
              <div className="shrink-0 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <FlightFoot vm={vm} />
              </div>
            )}
          </ProfileCard>
        </CardLayer>
      )}
      {stopsDrawn && (
        // Its id for its pins' taps, which bring it up from the pill (useFplCards).
        <CardLayer open={stopsShown} cardId={STOPS_CARD}>
          <StopsCard
            at={stopsAt}
            route={stopsRoute}
            scope={stopsScope}
            onScope={setStopsScope}
            onClose={closeStops}
            onOpenField={selectPlace}
            onAddStop={addStopField}
          />
        </CardLayer>
      )}
    </Shown.Provider>
  );
}
