import { Suspense, type ReactNode } from "react";
import { cn } from "cn";
import TabKept from "../../../components/TabKept";
import TabPage from "../../../components/TabPage";
import { loadFplStrip } from "../../search";
import { fromChunk } from "../../../lib/fromChunk";
import { FplActions } from "./FplActions";
import { RouteEditor } from "../routePanelParts";
import { routeBoxOpen, routeTyped, routeEditing } from "./routeEditing";
import type { PlanSlices } from "../vm/planSlices";

/** The strip under an empty route, off the first load (scripts/first-load.mjs):
 *  a route opened from the address never draws it. */
const FplStrip = fromChunk(loadFplStrip, (m) => m.default).Part;

/**
 * The sheet's second page, FPL (its toggle, PageToggle; the owner, 2026-11-13), under
 * the route's row: the route in order (the plan's nav log view), kept
 * mounted under whatever is open over it and on paper. Its cards, the
 * Brief, the Nav Log, the Profile and the Stops, are over the sheet beside
 * it (PlanCards), kept in flight when no page is drawn. The route is its
 * timeline in the row over this page (RouteHead, decision 0047); its field
 * and figures open under it here once asked for, by the timeline's Type or
 * Paste a Route or the keyboard button at Add a Stop's end (RouteEditor); in flight the
 * route read (the nav log's list). With no route, the timeline's card with
 * the two ends to pick over this page, and the flights saved and the
 * routes planned last under it, nothing between (the owner, 2026-11-11:
 * "We don't need plan a flight either with two buttons"; the search is the
 * other page, its toggle beside FPL's bar).
 */
export default function PlanPage({
  vm,
  navLog,
  more,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "fpl" | "map" | "picks" | "plan" | "route" | "routeList" | "stops" | "view">;
  navLog: ReactNode;
  /** The route's ••• as the flying drawer's fourth tile (FplActions). */
  more: ReactNode;
}) {
  const { stripsDrawn } = vm.view;
  const { hasPoints } = vm.route;
  const { cardUp, openList } = vm.cards;
  const { depAlone } = vm.map;
  const { openSaved } = vm.fpl;
  const editing = routeEditing(vm);
  return (
    // Always built: kept while Search is up, as it was left.
    <TabKept away={cardUp}>
      {/* FPL's nav log once there is a route, at the pilot's ask: open to
          edit, the route's cards (its `route`); while flying, FPL's tiles
          over it, the route's row not drawn then (the owner, 2026-11-15:
          "What about the fpl drawer when pulling it up?"). */}
      <div className={cn("flex min-h-0 flex-col print:flex", depAlone || editing ? "flex-none" : "flex-1", !hasPoints && "hidden")}>
        <div className="px-4 empty:hidden print:hidden">
          <FplActions vm={vm} more={more} />
        </div>
        {navLog}
      </div>
      {routeBoxOpen(vm) && !routeTyped(vm) && (
        // Its room while its code comes: the field's own line.
        <Suspense fallback={<div className="mx-4 mt-2 h-10 rounded-(--radius-banner) bg-card" />}>
          <RouteEditor vm={vm} />
        </Suspense>
      )}
      {/* And while a finger takes it up: the pill's own are out of
          sight then (the owner's notice, "Fpl hides Saved while dragging
          up"). */}
      {!hasPoints && stripsDrawn && (
        // The flights saved or the routes planned last, under the empty
        // route's cards, picked from its filter as before.
        <TabPage>
          <Suspense fallback={null}>
            <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
          </Suspense>
        </TabPage>
      )}
      {/* A departure alone: under it the flights saved and the routes
          planned last, to pick from, where the sheet stood empty under
          the one field (the owner's screenshot, 2026-10-23). */}
      {depAlone && hasPoints && (
        <div className="px-4 pt-2">
          <Suspense fallback={null}>
            <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
          </Suspense>
        </div>
      )}
    </TabKept>
  );
}
