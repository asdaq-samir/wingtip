import { Suspense } from "react";
import { EngineGate } from "../../../lib/engine/engineGate";
import { FavoriteStrip, PillSection, PillStrip } from "../../../components/Favorites";
import { usePreferences, type KeptAircraft, type RecentAirport } from "../../../lib/preferences";
import AddFavoriteTile from "../../../components/AddFavoriteTile";
import TabPage from "../../../components/TabPage";
import { AircraftFavoriteStrip, AircraftRecentTiles } from "../../aircraft-pick";
import { useAirportIndex } from "../../../lib/airportIndex";
import FindNearby from "./FindNearby";
import { NearestStrip } from "./NearestStrip";
import type { PlanSlices } from "../vm/planSlices";
import RecentCards from "./RecentCards";
import SheetFooter from "./SheetFooter";

/**
 * The one search with nothing typed (the owner's one-search design,
 * 2026-11-09), the sheet's Search page: Nearest and Find Nearby first (the owner,
 * 2026-11-11: "move nearest and find nearby above favorites"), then
 * Favorites and Recents, each the airports' and the airplanes' (one Add at
 * the Favorites' end), each section's title the list in full. The airplanes
 * had a page of their own with its own search, the traffic's, gone for this
 * one (the owner, 2026-11-14); a tap on one opens its card, or keeps it
 * where the search was asked for one (useSearchPanel's pickAirplane).
 * The flight and the flights saved and planned last are the FPL page's
 * alone (PlanPage), with "Plan a flight" there: the owner, 2026-11-11,
 * "We can remove plan button and saved from search", once the sheet had
 * its two pages. Laid out as Apple Maps'
 * web sheet (the owner's screenshot, 2026-11-10): the app's one section
 * title (PillSection), the Recents as picture cards sliding sideways, and its foot the
 * legal links and the copyright (SheetFooter).
 */
export default function SearchHome({
  vm,
  pickIdent,
  refusal,
}: {
  vm: PlanSlices<"cards" | "fpl" | "map" | "search">;
  /** Set while the search is asked to pick a point (FPL's Add a Stop, a point's Change Stop, an end):
   *  a tap on an airport -- Nearest's, a Favorite, Home, a Recent -- picks it as a result row does,
   *  not opens its card (the owner, 2026-11-21: "when I tap a nearest airport, it opens the airport
   *  card instead of selecting it"). */
  pickIdent?: (ident: string) => void;
  /** Why such a tile cannot be picked, greyed with it: Closed, On the route already. */
  refusal?: (ident: string) => string | null;
}) {
  // The index says which fields are closed, read as soon as a pick asks.
  useAirportIndex(true, !!pickIdent);
  const { selectPlace: openPlace, openList, selectFlight } = vm.cards;
  const selectPlace = pickIdent ?? openPlace;
  const { nearOrigin } = vm.map;
  const { openNearest, findNearby } = vm.fpl;
  const { home, favorites, askFor, pickAirplane, pickPlace: openRecent, nearStrip, nearMap } = vm.search;
  const pickPlace = (a: RecentAirport) => (pickIdent ? pickIdent(a.ident) : openRecent(a));
  const openAirplane = (kept: KeptAircraft) => pickAirplane(kept, (hex) => selectFlight(hex));
  const hasAirplane = usePreferences((s) => !!s.myAircraft || s.favoriteAircraft.length > 0);
  return (
    <TabPage testId="search-home">
      <PillSection title="Nearest" onMore={openNearest} testId="pill-section-nearest">
        {/* Each field's bearing is the engine's word (compassPoint), and the
            nearest can answer before its .wasm is there. */}
        <EngineGate>
          <NearestStrip fields={nearStrip} located={!!nearOrigin} nearMap={nearMap} onOpen={selectPlace} refusal={refusal} />
        </EngineGate>
      </PillSection>
      <FindNearby onFind={findNearby} />
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
            onAddHome={() => askFor("home")}
            refusal={refusal}
          />
          {/* An airplane kept with no kind is told one by the engine (keptKind). */}
          <Suspense fallback={null}>
            <EngineGate>
              <AircraftFavoriteStrip
                onOpen={openAirplane}
                onAddMine={() => askFor("mine")}
                onAddFavorite={() => askFor("airplane")}
                showAdd={false}
              />
            </EngineGate>
          </Suspense>
          {/* One Add at the row's end, as Apple Maps' Favorites have: with
              nothing kept yet Home's and Airplane's own "Add" stand. */}
          {(home || favorites.length > 0 || hasAirplane) && (
            <AddFavoriteTile
              testId="pill-favorite-add"
              choices={[
                { value: "airport", label: "Airport", testId: "pill-favorite-add-airport", onPick: () => askFor("favorite") },
                { value: "airplane", label: "Airplane", testId: "pill-favorite-add-airplane", onPick: () => askFor("airplane") },
              ]}
            />
          )}
        </PillStrip>
      </PillSection>
      <PillSection title="Recents" onMore={() => openList("recents")} testId="airport-recents">
        <RecentCards onPick={(airport) => void pickPlace(airport)} refusal={refusal} />
        <Suspense fallback={null}>
          <EngineGate>
            <AircraftRecentTiles onPick={openAirplane} />
          </EngineGate>
        </Suspense>
      </PillSection>
      <SheetFooter />
    </TabPage>
  );
}
