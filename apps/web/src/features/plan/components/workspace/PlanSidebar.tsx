import { lazy, useEffect } from "react";
import { fromChunk } from "../../../../lib/fromChunk";
import { loadAccountPanels } from "../../../pilot";
import type { LatLon } from "../../../../lib/geo";
import { pickKeptAircraft } from "../../lib/tabSearch";
import { MAX_STOPS } from "../../../../lib/identSchema";
import { AirportRecentsPage } from "../../../../components/PanelCapsule";
import { sameField } from "../../../../lib/procedures";
import { AircraftCard, AircraftPill, AircraftRecentsPage, usePrefetchAircraftTab } from "../../aircraftTabChunk";
import type { OneSearchModel } from "../../hooks/useOneSearch";
import TabKept from "../../../../components/TabKept";
import TabPage from "../../../../components/TabPage";
import { RecentRoutesPage } from "../RecentRoutes";
import { AirspaceCard, FlightCard, PastFlightCard, PlaceCard } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import Waits from "./Waits";

/** The one search's parts on chunks of their own, out of the first load
 *  (its 1.10 MB budget, scripts/first-load.mjs): its own page, drawn once
 *  the sheet is out, asked for a moment after the page draws; and its
 *  results, at the first letter typed. */
const searchHome = fromChunk(
  () => import("../search/SearchHome"),
  (m) => m.default,
);
const SearchHome = searchHome.Part;
const OneSearchResults = lazy(() => import("../search/OneSearchResults"));
const SearchResultsPage = lazy(() => import("../search/SearchResultsPage"));

/** The saved flights in full, FPL's card (the console's list, loaded as
 *  it opens). */
const SavedFlights = lazy(() => loadAccountPanels().then((m) => ({ default: m.FlightsPanel })));
// The Favorites in full, airports' and airplanes', when opened: their drag to reorder (GridList,
// SortableRows) kept out of the first load (scripts/first-load.mjs's budget, 2026-11-05).
const FavoritesList = lazy(() => import("../../../../components/FavoritesList"));
const AircraftFavoritesList = lazy(() => import("../AircraftFavoritesList"));
// Nearest's list in full, when it is opened; its strip is the pill's.
const NearestCard = lazy(() => import("../NearestCard"));

/**
 * The sheet's first page under the one search (PlanWorkspace's `sidebar`;
 * the plan is the second, PlanPage): the search's own page (SearchHome) or what answers what is typed
 * (OneSearchResults), and its lists in full -- Favorites, Recents, Saved,
 * the routes planned, Nearest; the traffic. A card -- an airport's, the
 * airspace's, an airplane's -- over the place it was opened from, its
 * close back to it.
 */
export default function PlanSidebar({
  vm,
  model,
}: {
  vm: PlanWorkspaceModel;
  /** The one search's view model (useOneSearch). */
  model: OneSearchModel;
}) {
  const { opened, stripsDrawn, view } = vm.view;
  const { addStop, depart, planned, routePoints, routed } = vm.route;
  const { course, s } = vm.plan;
  const {
    aircraftFavoritesOpen,
    aircraftOpen,
    aircraftRecentsOpen,
    airportRecentsOpen,
    approachesOf,
    cardUp,
    closeFlight,
    closeList,
    closePlace,
    favoritesOpen,
    flight,
    heldPoint,
    nearFrom,
    nearOpen,
    openList,
    past,
    place,
    routeRecentsOpen,
    selectFlight,
    selectPast,
    selectPlace,
    setApproachesOf,
    setNearFrom,
  } = vm.cards;
  const { flyHere, measuredFrom } = vm.map;
  const { keepFuelStops, suggestedAt } = vm.stops;
  const { dropIntoRoute } = vm.routeList;
  const { closeNearest, closeSaved, savedOpen } = vm.fpl;
  const {
    addFromPill,
    aircraftTyped,
    askFor,
    favorites,
    home,
    moveFavoriteAirport,
    pickPlace,
    query,
    setHomeAirport,
    toggleFavoriteAirport,
  } = vm.search;
  usePrefetchAircraftTab();
  useEffect(() => {
    const later = window.setTimeout(searchHome.prefetch, 1500);
    return () => window.clearTimeout(later);
  }, []);
  // In the traffic tab's Waits (below), as the rest of that tab is.
  const flightCard =
    flight && past ? (
      <PastFlightCard key={`${flight}-${past}`} hex={flight} id={past} onClose={() => selectPast(null)} />
    ) : flight ? (
      <FlightCard key={flight} hex={flight} onOpenPast={selectPast} onClose={closeFlight} onOpenAirport={selectPlace} />
    ) : null;
  // The airport's card, in the panel's body.
  const placeCard = place && (
    <Waits>
      <PlaceCard
        key={place}
        ident={place}
        from={measuredFrom}
        onClose={closePlace}
        // The route set from the card ends the search it was opened from,
        // its words and Cancel let go, as the top hit's Fly Here does
        // (one-search.spec's smoke test, 2026-11-12).
        onFlyHere={(to) => {
          model.letGo();
          void flyHere(to);
        }}
        onAddStop={(to) => {
          model.letGo();
          if (suggestedAt) keepFuelStops(suggestedAt.after, [place]);
          else addStop(to);
        }}
        // Shown but greyed for a point of the route, or past the planner's
        // most stops, with why (the owner, 2026-11-11: "show it but disable it").
        addStopOff={
          routePoints.includes(place)
            ? "already on the route"
            : planned.stops.length >= MAX_STOPS
              ? "the route has its most stops"
              : undefined
        }
        stop={suggestedAt?.stop}
        // The route's destination: when the flight lands there -- en route and on the ground at its
        // stops (Totals.ground_min) after it leaves, as the figures' ETA -- for its forecast's hour.
        arrival={
          !s.local && s.totals?.ete_min != null && sameField(place, `${planned.dest}`)
            ? { depart: depart || null, minutes: s.totals.ete_min + (s.totals.ground_min ?? 0) }
            : undefined
        }
        startOn={approachesOf === place ? "approaches" : undefined}
        onStarted={() => setApproachesOf(null)}
      />
    </Waits>
  );
  // With the Map switch at its right (AircraftPill).
  const aircraftStrip = (
    <AircraftPill
      onOpen={(hex) => selectFlight(hex)}
      onAddMine={() => addFromPill("mine")}
      onAddFavorite={() => addFromPill("airplane")}
      onPick={(plane) => selectFlight(plane.hex, plane)}
      onAllFavorites={() => openList("aircraft-favorites")}
      onAllRecents={() => openList("aircraft-recents")}
    />
  );
  return (
    <>
      {place ? (
        // Mounted at the pill as well, out of sight, so the minimized
        // tabs' Back there has a card to close.
        placeCard
      ) : heldPoint ? (
        <Waits>
          <AirspaceCard
            key={`${heldPoint.lat},${heldPoint.lon}`}
            point={heldPoint}
            onClose={() => selectPlace(null)}
            {...(routed && course && planned.stops.length < MAX_STOPS
              ? {
                  onAdd: (ident: string, at: LatLon) => dropIntoRoute(ident, at, "add"),
                  onDirect: (ident: string, at: LatLon) => dropIntoRoute(ident, at, "direct"),
                  onHold: (ident: string, at: LatLon) => dropIntoRoute(ident, at, "hold"),
                }
              : {})}
          />
        </Waits>
      ) : null}
      {/* Each place once opened kept under the others (TabKept): back to
          it, as it was left. */}
      {opened.includes("traffic") && (
        <TabKept away={cardUp || view !== "traffic"}>
          <Waits>
            {flightCard ??
              (aircraftOpen &&
                (aircraftFavoritesOpen && !aircraftTyped ? (
                  <TabPage testId="aircraft-favorites">
                    <Waits>
                      <AircraftFavoritesList
                        onBack={closeList}
                        onOpen={(hex) => selectFlight(hex)}
                        onChangeMine={() => {
                          closeList();
                          addFromPill("mine");
                        }}
                        onAdd={() => {
                          closeList();
                          addFromPill("airplane");
                        }}
                      />
                    </Waits>
                  </TabPage>
                ) : aircraftRecentsOpen && !aircraftTyped ? (
                  // Kept open under an airplane's card opened from it, as the
                  // Favorites in full are: its close comes back here.
                  <AircraftRecentsPage onBack={closeList} onPick={(kept) => pickKeptAircraft(kept, (hex) => selectFlight(hex))} />
                ) : (
                  // The strip once, in the pill or here: at the pill's size the
                  // body is out of sight but for a finger taking it up.
                  <AircraftCard
                    onPick={(plane) => selectFlight(plane.hex, plane)}
                    onPickHex={(hex) => selectFlight(hex)}
                    strip={stripsDrawn ? aircraftStrip : null}
                  />
                )))}
          </Waits>
        </TabKept>
      )}
      {!cardUp && view === "search" && nearOpen && (
        <Waits>
          <NearestCard onOpen={selectPlace} from={nearFrom} onFrom={setNearFrom} onBack={closeNearest} />
        </Waits>
      )}
      {/* Always built, the sheet's first page (SheetTabBar's Search tab):
          kept while FPL is up, as it was left. */}
      <TabKept away={cardUp || view === "traffic" || nearOpen}>
        {favoritesOpen ? (
          <TabPage testId="favorites-page">
            <Waits>
              <FavoritesList
                home={home}
                favorites={favorites}
                onBack={closeList}
                onOpen={(airport) => selectPlace(airport.ident)}
                onChangeHome={() => askFor("home")}
                onRemoveHome={() => setHomeAirport(null)}
                onRemove={toggleFavoriteAirport}
                onMove={moveFavoriteAirport}
                onAdd={() => askFor("favorite")}
              />
            </Waits>
          </TabPage>
        ) : airportRecentsOpen && !query ? (
          <TabPage testId="airport-recents-list">
            <AirportRecentsPage
              onBack={closeList}
              onPick={(airport) => {
                closeList();
                void pickPlace(airport);
              }}
            />
          </TabPage>
        ) : routeRecentsOpen ? (
          <TabPage testId="route-recents-list">
            <RecentRoutesPage onBack={closeList} />
          </TabPage>
        ) : savedOpen ? (
          <TabPage testId="saved-flights">
            <Waits>
              <SavedFlights onBack={closeSaved} />
            </Waits>
          </TabPage>
        ) : model.typed || model.direct ? (
          // A search sent, its results, else the suggestions: each its own scroll box (one scrolling rule).
          <TabPage key={model.sent ? "results" : "suggestions"} testId="search-page">
            <Waits>{model.sent ? <SearchResultsPage /> : <OneSearchResults model={model} />}</Waits>
          </TabPage>
        ) : (
          stripsDrawn && <SearchHome vm={vm} />
        )}
      </TabKept>
    </>
  );
}
