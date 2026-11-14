import type { ReactNode } from "react";
import { cn } from "cn";
import TabKept from "../../../../components/TabKept";
import TabPage from "../../../../components/TabPage";
import FplStrip from "../FplStrip";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/**
 * The sheet's second page, FPL (its toggle, PageToggle; the owner, 2026-11-13), under
 * the route's row: its tabs, the Nav Log -- the route in order and its
 * legs -- the Brief and the Profile, in the floating bar at its foot
 * (FplTabs; the owner, 2026-11-14), kept mounted under whatever is open
 * over it and on paper. The Stops, and the Profile's card while a dry run
 * flies, are over the sheet beside it (PlanCards), kept in flight when no
 * page is drawn. With no route, the
 * empty box and the flights saved and the routes planned last under it,
 * nothing between (the owner, 2026-11-11: "We don't need plan a flight
 * either with two buttons"; the search is the other page, its tab beside
 * FPL's).
 */
export default function PlanPage({ vm, tabs }: { vm: PlanWorkspaceModel; tabs: ReactNode }) {
  const { stripsDrawn } = vm.view;
  const { hasPoints } = vm.route;
  const { cardUp, openList } = vm.cards;
  const { depAlone } = vm.map;
  const { openSaved } = vm.fpl;
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
      {/* FPL's tabs once there is a route, at the pilot's ask. */}
      <div className={cn("flex min-h-0 flex-col print:flex", depAlone ? "flex-none" : "flex-1", !hasPoints && "hidden")}>{tabs}</div>
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
