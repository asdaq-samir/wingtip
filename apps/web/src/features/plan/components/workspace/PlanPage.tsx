import type { ComponentProps, ReactNode } from "react";
import { Route } from "lucide-react";
import { cn } from "cn";
import { routeName } from "../../../../lib/identSchema";
import { askSearch } from "../../../../lib/oneSearch";
import type { FlightRules } from "../../../../lib/preferences";
import EmptyState from "../../../../components/EmptyState";
import Segmented from "../../../../components/Segmented";
import TabKept from "../../../../components/TabKept";
import TabPage from "../../../../components/TabPage";
import { Button } from "../../../../components/ui/button";
import FplStrip from "../FplStrip";
import ProfileCard from "../ProfileCard";
import { BriefCard, StopsCard, DryRunControls } from "../../routePanelParts";
import { SAMPLE_FLIGHT } from "../../lib/sampleFlight";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import ProfileSideView from "./ProfileSideView";
import Waits from "./Waits";

/** The flight rules a route is planned under, as the Profile card's switch
 *  offers them. */
const FLIGHT_RULES = [
  { value: "vfr", label: "VFR" },
  { value: "ifr", label: "IFR" },
];

/**
 * The sheet's second page, FPL (SheetPager; the owner, 2026-11-11), under
 * the route's row: the plan's nav log, kept mounted under whatever is open
 * over it and on paper; the Brief, the Profile and the Stops as cards over
 * it. With no route, "Plan a flight" (EmptyState, iOS's
 * ContentUnavailableView), its Search going to the first page with the
 * field focused, its Open Sample Flight the welcome's (useWelcome), and the
 * flights saved and the routes planned last under it.
 */
export default function PlanPage({
  vm,
  navLog,
  briefContents,
  briefNotice,
}: {
  vm: PlanWorkspaceModel;
  navLog: ReactNode;
  briefContents: ComponentProps<typeof BriefCard>["contents"];
  briefNotice: ReactNode;
}) {
  const {
    addStopField,
    briefHere,
    briefLine,
    cardUp,
    closeBrief,
    closeProfileCard,
    closeStops,
    course,
    depAlone,
    dryRunning,
    flightRules,
    goMissed,
    goMissedNow,
    hasPoints,
    marks,
    openList,
    openSaved,
    pickView,
    planned,
    profileCautions,
    profileHere,
    routeKey,
    s,
    selectPlace,
    setFlightRules,
    setRoute,
    setStopsScope,
    showLegs,
    stopDryRun,
    stopsAt,
    stopsHere,
    stopsRoute,
    stopsScope,
    stripsDrawn,
  } = vm;
  // The search's page up and its field focused (useOneSearch takes the ask).
  const toSearch = () => {
    pickView("search");
    askSearch();
  };
  return (
    // Always built: swiped to from the search, it is in sight before it is picked.
    <TabKept away={cardUp}>
      {!hasPoints && !stopsHere && (
        <EmptyState
          icon={<Route />}
          title="Plan a flight"
          action={
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={toSearch} data-testid="fpl-empty-search">
                Search
              </Button>
              <Button type="button" variant="outline" onClick={() => setRoute(SAMPLE_FLIGHT)} data-testid="fpl-empty-sample">
                Open Sample Flight
              </Button>
            </div>
          }
          className="pb-2"
        >
          Search for an airport, then Fly Here or Depart From.
        </EmptyState>
      )}
      {/* And while a finger takes it up: the pill's own are out of
          sight then (the owner's notice, "Fpl hides Saved while dragging
          up"). Not under the Stops with no route: FPL's Saved stood over
          its list (the owner's screenshot, 2026-10-26). */}
      {!hasPoints && !stopsHere && stripsDrawn && (
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
      {profileHere && (
        <ProfileCard
          name={routeName(planned.dep, planned.dest, planned.stops)}
          line={briefLine}
          onClose={closeProfileCard}
          cautions={profileCautions}
          corner={
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
              height; its figures counting down at the sheet's foot. */}
          {dryRunning ? (
            <Waits>
              <div className="flex min-h-0 flex-1 flex-col" data-testid="profile-dry-run">
                <DryRunControls run={dryRunning} ends={course} onClose={stopDryRun} missed={goMissed} onMissed={goMissedNow} />
              </div>
            </Waits>
          ) : (
            <ProfileSideView vm={vm} />
          )}
        </ProfileCard>
      )}
      {stopsHere && (
        <StopsCard
          at={stopsAt}
          route={stopsRoute}
          scope={stopsScope}
          onScope={setStopsScope}
          onClose={closeStops}
          onOpenField={selectPlace}
          onAddStop={addStopField}
        />
      )}
      {/* FPL's nav log once there is a route, at the pilot's ask. */}
      <div
        className={cn(
          "flex min-h-0 flex-col print:flex",
          depAlone ? "flex-none" : "flex-1",
          (briefHere || profileHere || stopsHere || !hasPoints) && "hidden",
        )}
      >
        {navLog}
      </div>
      {/* A departure alone: under it the flights saved and the routes
          planned last, to pick from, where the sheet stood empty under
          the one field (the owner's screenshot, 2026-10-23). */}
      {depAlone && hasPoints && !briefHere && !profileHere && !stopsHere && (
        <div className="px-4 pt-2" data-testid="fpl-departure-strip">
          <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
        </div>
      )}
    </TabKept>
  );
}
