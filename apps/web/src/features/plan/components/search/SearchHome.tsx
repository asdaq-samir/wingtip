import { Suspense, lazy } from "react";
import { FavoriteStrip, PillSection, PillStrip } from "../../../../components/Favorites";
import TabPage from "../../../../components/TabPage";
import { useAsk } from "../../../../lib/ask/useAsk";
import { AircraftFavoriteStrip } from "../../aircraftTabChunk";
import FindNearby from "../FindNearby";
import FplStrip from "../FplStrip";
import { NearestStrip } from "../NearestStrip";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import type { OneSearchModel } from "../../hooks/useOneSearch";
import FlightSummary from "./FlightSummary";
import RecentCards from "./RecentCards";
import SheetFooter from "./SheetFooter";

/** The assistant's answers, on their own chunk: drawn only once it has
 *  been asked from the search (the first load's budget). */
const AskSection = lazy(() => import("../ask/AskCard"));

/**
 * The one search with nothing typed (the owner's one-search design,
 * 2026-11-09): the sheet's page under the field where there is no route,
 * or the field is in use -- the flight first (FlightSummary, a tap to the
 * plan), the assistant's answers where it was asked from here, then
 * Favorites (the airports' and the airplanes'), Recents, Nearest, the
 * flights saved and planned last, and Find Nearby. What the Airport and
 * Airplane tabs listed, and FPL's no-route strip, in one page: each
 * section's title the list in full, as before. Laid out as Apple Maps'
 * web sheet (the owner's screenshot, 2026-11-10): large bold section
 * titles, the Recents as picture cards sliding sideways, and its foot the
 * legal links and the copyright (SheetFooter).
 */
export default function SearchHome({ vm, model }: { vm: PlanWorkspaceModel; model: OneSearchModel }) {
  const {
    home,
    favorites,
    selectPlace,
    addFromPill,
    askFor,
    pickPlace,
    openList,
    openNearest,
    openSaved,
    findNearby,
    nearStrip,
    nearOrigin,
    selectFlight,
    pickView,
  } = vm;
  const asked = useAsk((s) => s.turns.length > 0 || s.busy);
  return (
    <TabPage testId="search-home">
      <FlightSummary
        vm={vm}
        onOpen={() => {
          model.cancel();
          pickView("plan");
        }}
      />
      {asked && (
        <Suspense fallback={null}>
          <AskSection />
        </Suspense>
      )}
      <PillSection large title="Favorites" onMore={() => openList("favorites")} testId="pill-section-favorites">
        {/* Home and the airports, then the Airplane and the airplanes, in one
            row sliding sideways, as Apple Maps' Favorites are (the sheet
            audit's F-L2): they stood in two rows, a tile each. Each strip's
            own box laid out of the way (display: contents), its tiles in
            this one. */}
        <PillStrip testId="pill-favorites-row" className="[&>div]:contents">
          <FavoriteStrip
            home={home}
            favorites={favorites}
            onOpen={(a) => selectPlace(a.ident)}
            onAddHome={() => addFromPill("home")}
            onAddFavorite={() => askFor("favorite")}
          />
          <Suspense fallback={null}>
            <AircraftFavoriteStrip
              onOpen={(hex) => selectFlight(hex)}
              onAddMine={() => {
                pickView("traffic");
                addFromPill("mine");
              }}
              onAddFavorite={() => {
                pickView("traffic");
                addFromPill("airplane");
              }}
            />
          </Suspense>
        </PillStrip>
      </PillSection>
      <PillSection large title="Recents" onMore={() => openList("recents")} testId="airport-recents">
        <RecentCards onPick={(airport) => void pickPlace(airport)} />
      </PillSection>
      <PillSection large title="Nearest" onMore={openNearest} testId="pill-section-nearest">
        <NearestStrip fields={nearStrip} located={!!nearOrigin} onOpen={selectPlace} />
      </PillSection>
      <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
      <FindNearby onFind={findNearby} />
      <SheetFooter />
    </TabPage>
  );
}
