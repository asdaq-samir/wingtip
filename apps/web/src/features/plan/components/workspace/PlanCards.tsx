import FlightFoot from "./FlightFoot";
import { Shown, useShown } from "../../../../lib/shown";
import ProfileCard from "../ProfileCard";
import { StopsCard, DryRunControls } from "../../routePanelParts";
import { CardLayer } from "../../../../components/sheet/CardLayer";
import { useOpenedOnce } from "../../../../components/sheet/useOpenedOnce";
import ProfileLine from "./ProfileLine";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import Waits from "./Waits";
import { STOPS_CARD } from "../../hooks/useFplCards";

/**
 * FPL's cards over the sheet, each its own nested drawer (CardLayer): the
 * Stops, and the Profile's while a dry run flies. The Brief, the Nav Log
 * and the Profile are FPL's tabs (FplTabs; the owner, 2026-11-14); a dry
 * run started from the Profile's tab plays in a card of its own, as the
 * Profile's card played it, its controls -- pause, step, stop -- and the
 * flight's figures with Done flying at its foot (docs/design/rules.md, the
 * card rules' 12). The Stops and the run's card are kept between their
 * openings (CardLayer's `open`), built once.
 *
 * Mounted beside the sheet's pages, not in FPL's (PlanPage), as in flight
 * the sheet draws no pages (MapPanel's `flying`): inside the page, a dry
 * run took its controls away the moment the airplane flew. Out of sight
 * under a place's card, as the page is (TabKept).
 */
export default function PlanCards({ vm }: { vm: PlanWorkspaceModel }) {
  const { routed } = vm.route;
  const { course } = vm.plan;
  const { cardUp, selectPlace } = vm.cards;
  const { addStopField } = vm.stops;
  const { closeStops, profileShown, setStopsScope, stopsAt, stopsShown, stopsRoute, stopsScope } = vm.fpl;
  const { dryRunning, goMissed, goMissedNow, stopDryRun } = vm.flight;
  const { briefLine, profileCautions } = vm.brief;
  // The run's card up while it flies, over FPL's Profile it was started
  // from; ✕ stops it, as Stop does. Under Search (NRST) it flies on unseen.
  const runShown = profileShown && !!dryRunning;
  const runDrawn = useOpenedOnce(runShown);
  const stopsDrawn = useOpenedOnce(stopsShown);
  const shown = useShown() && !cardUp;
  return (
    <Shown.Provider value={shown}>
      {runDrawn && routed && (
        <CardLayer open={runShown}>
          <ProfileCard name="Profile" sub={<ProfileLine vm={vm} />} line={briefLine} onClose={stopDryRun} cautions={profileCautions}>
            {dryRunning && (
              <Waits>
                <div className="flex min-h-0 flex-1 flex-col" data-testid="profile-dry-run">
                  <DryRunControls run={dryRunning} ends={course} onClose={stopDryRun} missed={goMissed} onMissed={goMissedNow} />
                </div>
              </Waits>
            )}
            {/* The flight's figures and its way out -- the dry run's figures,
                Done flying -- at the foot of the card in sight, not left on
                FPL's foot under it: the native pattern, as Apple Maps'
                navigation card carries its arrival figures and End (the
                owner, 2026-11-12: "Just do it the native way"). */}
            {runShown && (
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
