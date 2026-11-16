import { lazy, useEffect } from "react";
import { fromChunk } from "../../../../lib/fromChunk";
import { loadAccountPanels } from "../../../pilot";
import type { LatLon } from "../../../../lib/geo";
import { MAX_STOPS } from "../../../../lib/identSchema";
import { RecentsPage } from "../../../../components/PanelCapsule";
import { sameField } from "../../../../lib/procedures";
import { AircraftRecentRows, usePrefetchAircraftTiles } from "../../aircraftTilesChunk";
import type { OneSearchModel } from "../../hooks/useOneSearch";
import TabKept from "../../../../components/TabKept";
import TabPage from "../../../../components/TabPage";
import { RecentRoutesPage } from "../RecentRoutes";
import { AirspaceCard, FlightCard, PastFlightCard, PlaceCard } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import type { KeptAircraft } from "../../../../lib/preferences";
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
const AircraftFavoriteGroups = lazy(() => import("../AircraftFavoriteGroups"));
// Nearest's list in full, when it is opened; its strip is the pill's.
const NearestCard = lazy(() => import("../NearestCard"));

/**
 * The sheet's first page under the one search (PlanWorkspace's `sidebar`;
 * the plan is the second, PlanPage): the search's own page (SearchHome) or what answers what is typed
 * (OneSearchResults), and its lists in full -- Favorites, Recents, Saved,
 * the routes planned, Nearest. A card -- an airport's, the airspace's, an
 * airplane's -- over the place it was opened from, its close back to it.
 * The traffic's page that was here, with its own search field, went for
 * the one search (the owner, 2026-11-14).
 */
export default function PlanSidebar({
  vm,
  model,
}: {
  vm: PlanWorkspaceModel;
  /** The one search's view model (useOneSearch). */
  model: OneSearchModel;
}) {
  const { stripsDrawn, view } = vm.view;
  const { addStop, depart, planned, routePoints, routed } = vm.route;
  const { course, s } = vm.plan;
  const {
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
  const { askFor, favorites, home, moveFavoriteAirport, pickAirplane, pickPlace, query, setHomeAirport, toggleFavoriteAirport } = vm.search;
  usePrefetchAircraftTiles();
  useEffect(() => {
    const later = window.setTimeout(searchHome.prefetch, 1500);
    return () => window.clearTimeout(later);
  }, []);
  // An airplane's card, over whichever place is up, as an airport's is.
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
  // An airplane in a list in full: opened, or kept where the search was asked for one.
  const openAirplane = (kept: KeptAircraft) => pickAirplane(kept, (hex) => selectFlight(hex));
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
      {flightCard && <Waits>{flightCard}</Waits>}
      {!cardUp && view === "search" && nearOpen && (
        <Waits>
          <NearestCard onOpen={selectPlace} from={nearFrom} onFrom={setNearFrom} onBack={closeNearest} />
        </Waits>
      )}
      {/* Always built, the sheet's first page (Search, PageToggle):
          kept while FPL is up, as it was left. */}
      <TabKept away={cardUp || nearOpen}>
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
                airplanes={(editing) => (
                  <AircraftFavoriteGroups
                    editing={editing}
                    onOpen={openAirplane}
                    onChangeMine={() => askFor("mine")}
                    onAdd={() => askFor("airplane")}
                  />
                )}
              />
            </Waits>
          </TabPage>
        ) : airportRecentsOpen && !query ? (
          <TabPage testId="airport-recents-list">
            <RecentsPage
              onBack={closeList}
              onPick={(airport) => {
                closeList();
                void pickPlace(airport);
              }}
              // Kept open under an airplane's card opened from it, as the
              // Favorites in full are: its close comes back here.
              airplanes={<AircraftRecentRows onPick={openAirplane} />}
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
        ) : model.typed || model.direct || (model.pick && model.does.length > 0) ? (
          // A search sent, its results, else the suggestions: each its own scroll box (one scrolling rule);
          // a picker's ask with a row before anything is typed too (the departure's My Position).
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
