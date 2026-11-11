import { Suspense, lazy } from "react";
import { FavoriteStrip, PillSection, PillStrip } from "../../../../components/Favorites";
import TabPage from "../../../../components/TabPage";
import { useAsk } from "../../../../lib/ask/useAsk";
import { AircraftFavoriteStrip } from "../../aircraftTabChunk";
import FindNearby from "../FindNearby";
import { NearestStrip } from "../NearestStrip";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import RecentCards from "./RecentCards";
import SheetFooter from "./SheetFooter";

/** The assistant's answers, on their own chunk: drawn only once it has
 *  been asked from the search (the first load's budget). */
const AskSection = lazy(() => import("../ask/AskCard"));

/**
 * The one search with nothing typed (the owner's one-search design,
 * 2026-11-09), the sheet's Search page: the assistant's answers where it
 * was asked from here, then Favorites (the airports' and the airplanes'),
 * Recents, Nearest and Find Nearby, each section's title the list in full.
 * The flight and the flights saved and planned last are the FPL page's
 * alone (PlanPage), with "Plan a flight" there: the owner, 2026-11-11,
 * "We can remove plan button and saved from search", once the sheet had
 * its two pages. Laid out as Apple Maps'
 * web sheet (the owner's screenshot, 2026-11-10): the app's one section
 * title (PillSection), the Recents as picture cards sliding sideways, and its foot the
 * legal links and the copyright (SheetFooter).
 */
export default function SearchHome({ vm }: { vm: PlanWorkspaceModel }) {
  const {
    home,
    favorites,
    selectPlace,
    addFromPill,
    askFor,
    pickPlace,
    openList,
    openNearest,
    findNearby,
    nearStrip,
    nearOrigin,
    selectFlight,
    pickView,
  } = vm;
  const asked = useAsk((s) => s.turns.length > 0 || s.busy);
  return (
    <TabPage testId="search-home">
      {asked && (
        <Suspense fallback={null}>
          <AskSection />
        </Suspense>
      )}
      <PillSection title="Favorites" onMore={() => openList("favorites")} testId="pill-section-favorites">
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
      <PillSection title="Recents" onMore={() => openList("recents")} testId="airport-recents">
        <RecentCards onPick={(airport) => void pickPlace(airport)} />
      </PillSection>
      <PillSection title="Nearest" onMore={openNearest} testId="pill-section-nearest">
        <NearestStrip fields={nearStrip} located={!!nearOrigin} onOpen={selectPlace} />
      </PillSection>
      <FindNearby onFind={findNearby} />
      <SheetFooter />
    </TabPage>
  );
}
