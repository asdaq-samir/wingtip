import { Suspense, lazy } from "react";
import { FavoriteStrip, PillSection } from "../../../../components/Favorites";
import { RecentAirportTiles } from "../../../../components/PanelCapsule";
import TabPage from "../../../../components/TabPage";
import { useAsk } from "../../../../lib/ask/useAsk";
import { AircraftFavoriteStrip } from "../../aircraftTabChunk";
import FindNearby from "../FindNearby";
import FplStrip from "../FplStrip";
import { NearestStrip } from "../NearestStrip";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import type { OneSearchModel } from "../../hooks/useOneSearch";
import FlightSummary from "./FlightSummary";

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
 * section's title the list in full, as before.
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
      <PillSection title="Favorites" onMore={() => openList("favorites")} testId="pill-section-favorites">
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
      </PillSection>
      <PillSection title="Recents" onMore={() => openList("recents")} testId="airport-recents">
        <RecentAirportTiles onPick={(airport) => void pickPlace(airport)} />
      </PillSection>
      <PillSection title="Nearest" onMore={openNearest} testId="pill-section-nearest">
        <NearestStrip fields={nearStrip} located={!!nearOrigin} onOpen={selectPlace} />
      </PillSection>
      <FplStrip onAllSaved={openSaved} onAllRecents={() => openList("routes")} />
      <FindNearby onFind={findNearby} />
    </TabPage>
  );
}
