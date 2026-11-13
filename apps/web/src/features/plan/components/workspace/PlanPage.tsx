import type { ComponentProps, ReactNode } from "react";
import FlightFoot from "./FlightFoot";
import { cn } from "cn";
import { routeName } from "../../../../lib/identSchema";
import type { FlightRules } from "../../../../lib/preferences";
import Segmented from "../../../../components/Segmented";
import TabKept from "../../../../components/TabKept";
import TabPage from "../../../../components/TabPage";
import FplStrip from "../FplStrip";
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
 * The sheet's second page, FPL (its tab, SheetTabBar; the owner, 2026-11-13), under
 * the route's row: the route in order (the plan's nav log view), kept
 * mounted under whatever is open over it and on paper; the Brief, the Nav
 * Log, the Profile and the Stops cards of their own over it (the owner,
 * 2026-11-11: pages are cards), each its own size, grabber and ✕. The Nav
 * Log, the Profile and the Stops are kept between their openings
 * (CardLayer's `open`), built once. With no route, the empty box and the
 * flights saved and the routes planned last under it, nothing between
 * (the owner, 2026-11-11: "We don't need plan a flight either with two
 * buttons"; the search is the other page, its tab beside FPL's).
 */
export default function PlanPage({
  vm,
  navLog,
  navLogCard,
  briefContents,
  briefNotice,
}: {
  vm: PlanWorkspaceModel;
  navLog: ReactNode;
  /** The Nav Log card's legs (useNavLogs). */
  navLogCard: ReactNode;
  briefContents: ComponentProps<typeof BriefCard>["contents"];
  briefNotice: ReactNode;
}) {
  const { stripsDrawn } = vm.view;
  const { flightRules, hasPoints, planned, routeKey, routed, setFlightRules } = vm.route;
  const { course, s } = vm.plan;
  const { cardUp, openList, selectPlace } = vm.cards;
  const { depAlone } = vm.map;
  const { addStopField } = vm.stops;
  const {
    briefHere,
    closeBrief,
    closeProfileCard,
    closeStops,
    navLogShown,
    openSaved,
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
  return (
    // Always built: kept while Search is up, as it was left.
    <TabKept away={cardUp}>
      {/* And while a finger takes it up: the pill's own are out of
          sight then (the owner's notice, "Fpl hides Saved while dragging
          up"). */}
      {!hasPoints && stripsDrawn && (
        // The flights saved or the routes planned last, under the empty
        // box, picked from its filter as before.
        <TabPage>
          <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
        </TabPage>
      )}
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
      {/* FPL's nav log once there is a route, at the pilot's ask. */}
      <div className={cn("flex min-h-0 flex-col print:flex", depAlone ? "flex-none" : "flex-1", !hasPoints && "hidden")}>{navLog}</div>
      {/* A departure alone: under it the flights saved and the routes
          planned last, to pick from, where the sheet stood empty under
          the one field (the owner's screenshot, 2026-10-23). */}
      {depAlone && hasPoints && (
        <div className="px-4 pt-2" data-testid="fpl-departure-strip">
          <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
        </div>
      )}
    </TabKept>
  );
}
