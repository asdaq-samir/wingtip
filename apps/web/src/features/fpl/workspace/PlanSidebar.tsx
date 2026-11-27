import { lazy, useEffect, useEffectEvent } from "react";
import { fromChunk } from "../../../lib/fromChunk";
import { loadAccountPanels } from "../../pilot";
import type { LatLon } from "../../../lib/geo";
import { MAX_STOPS } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { arrivalMin } from "../../plan";
import { useInspector } from "../../../hooks/use-inspector";
import { AircraftRecentRows, usePrefetchAircraftTiles, loadAircraftFavoriteGroups } from "../../aircraft-pick";
import { useOneSearchModel } from "../search/oneSearchModel";
import { useSearchQuery } from "../search/searchQuery";
import TabKept from "../../../components/TabKept";
import TabPage from "../../../components/TabPage";
import { loadRecentRoutesPage, loadSearchResultsPage, loadNearestCard } from "../../search";
import { AirspaceCard, PastFlightCard, PlaceCard } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import type { KeptAircraft } from "../../../lib/preferences";
import { afterRouteDrawn } from "../../../lib/routeDrawn";
import Waits from "./Waits";
import SearchBox from "../search/SearchBox";

/** The one search's parts on chunks of their own, out of the first load
 *  (its 1.10 MB budget, scripts/first-load.mjs): its own page, drawn once
 *  the sheet is out, asked for a moment after the page draws; and its
 *  results, at the first letter typed. */
const searchHome = fromChunk(
  () => import("../search/SearchHome"),
  (m) => m.default,
);
const SearchHome = searchHome.Part;
/** Recents in full, airports' and routes', opened from the search's page:
 *  off the first load too, with their grouped rows and Favorites' heads
 *  (GroupedList, Favorites), and asked for with the search's page. */
const recentsPage = fromChunk(
  () => import("../../../components/PanelCapsule"),
  (m) => m.RecentsPage,
);
const RecentsPage = recentsPage.Part;
const recentRoutesPage = fromChunk(loadRecentRoutesPage, (m) => m.RecentRoutesPage);
const RecentRoutesPage = recentRoutesPage.Part;
const OneSearchResults = lazy(() => import("../search/OneSearchResults"));
const SearchResultsPage = lazy(() => loadSearchResultsPage());

/** The saved flights in full, FPL's card (the console's list, loaded as
 *  it opens). */
const SavedFlights = lazy(() => loadAccountPanels().then((m) => ({ default: m.FlightsPanel })));
// The Favorites in full, airports' and airplanes', when opened: their drag to reorder (GridList,
// SortableRows) kept out of the first load (scripts/first-load.mjs's budget, 2026-11-05).
const FavoritesList = lazy(() => import("../../../components/FavoritesList"));
const AircraftFavoriteGroups = lazy(() => loadAircraftFavoriteGroups());
// Nearest's list in full, when it is opened; its strip is the pill's.
const NearestCard = lazy(() => loadNearestCard());

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
}: {
  vm: PlanSlices<"cards" | "fpl" | "map" | "plan" | "route" | "routeList" | "search" | "stops" | "view">;
}) {
  // The one search's view model (OneSearchRoot round the panel).
  const model = useOneSearchModel();
  const { stripsDrawn, view } = vm.view;
  const { addStop, depart, planned, routePoints, routed } = vm.route;
  const { course, s } = vm.plan;
  const {
    airportRecentsOpen,
    approachesOf,
    cardUp,
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
  // A card in the inspector at the map's right (an iPad on its side) is
  // beside the sheet, not over it: the search stays under its field, its
  // results with it, as Apple Maps keeps its list in the sidebar while a
  // place's card shows (the HIG audit of 2026-11-23, M4, the owner taking
  // its recommendation), where the sheet went blank under "KOSH".
  const inspector = useInspector();
  const covered = cardUp && !inspector;
  const { flyHere, measuredFrom } = vm.map;
  const { keepFuelStops, suggestedAt } = vm.stops;
  const { dropIntoRoute } = vm.routeList;
  const { closeNearest, closeSaved, savedOpen } = vm.fpl;
  const { askFor, favorites, home, moveFavoriteAirport, pickAirplane, pickPlace, setHomeAirport, toggleFavoriteAirport } = vm.search;
  const typing = useSearchQuery((s) => s.query !== "");
  usePrefetchAircraftTiles();
  useEffect(() => {
    // Once the route opened has drawn (lib/routeDrawn), out of its first seconds.
    return afterRouteDrawn(() => {
      searchHome.prefetch();
      recentsPage.prefetch();
      recentRoutesPage.prefetch();
    }, 1500);
  }, []);
  // An airplane's past flight, over its card (the one airplane card, features/airplane, which the
  // page holds).
  const flightCard =
    flight && past ? <PastFlightCard key={`${flight}-${past}`} hex={flight} id={past} onClose={() => selectPast(null)} /> : null;
  // A stop asked for (FPL's Add a Stop) while the card is up, opened from
  // the search's page or the map: its Add Stop is the pick, put in where
  // the pilot asked, as a row tapped in the search would be.
  const stopAsked = !!model.pick?.stop;
  // A stop asked for starts at the search, never at an airport's card left
  // open from before (one on the map, kept in the address): it showed in
  // the ask's place, as if Add a Stop opened that field (the owner,
  // 2026-11-20: "Add stop opens the first stop after departure every time
  // I tap it"). A card opened during the ask is kept.
  const asked = model.pick;
  const closeLeftCard = useEffectEvent(() => {
    if (place) closePlace();
  });
  useEffect(() => {
    if (asked?.stop) closeLeftCard();
  }, [asked]);
  // A picker's ask draws the one search's field in the body, under the
  // ask's title in the sheet's first row (OneSearchField, Apple Maps' Add Stop).
  const askField = model.pick && !model.pick.waiting ? <SearchBox model={model} inputRef={vm.search.searchInput} using /> : null;
  // The airport's card, in the panel's body.
  const placeCard = place && (
    <Waits>
      <PlaceCard
        key={place}
        ident={place}
        from={measuredFrom}
        // A stop asked for from FPL: the card's ✕ ends the ask and goes
        // back to FPL, where the pilot asked from, not to the search's page
        // (the owner, 2026-11-20: "When I add stop from fpl and search for
        // airport, then close, it goes back to search page instead of fpl").
        onClose={stopAsked ? model.cancel : closePlace}
        // The route set from the card ends the search it was opened from,
        // its words and Cancel let go, as the top hit's Fly Here does
        // (one-search.spec's smoke test, 2026-11-12).
        onFlyHere={(to) => {
          model.letGo();
          void flyHere(to);
        }}
        onAddStop={(to) => {
          if (stopAsked) {
            closePlace();
            model.pickIdent(to.ident);
            return;
          }
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
        asStop={stopAsked}
        // The route's destination: when the flight lands there -- en route and on the ground at its
        // stops (Totals.ground_min) after it leaves, as the figures' ETA -- for its forecast's hour.
        arrival={
          !s.local && s.totals?.ete_min != null && sameField(place, `${planned.dest}`)
            ? { depart: depart || null, minutes: arrivalMin(s.totals)! }
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
      <TabKept away={covered || nearOpen}>
        {/* A picker's field, over whatever answers it: one field, kept as
            the body under it turns from the lists to the results. */}
        {askField && <div className="flex shrink-0 px-4 pt-2">{askField}</div>}
        {favoritesOpen ? (
          <TabPage>
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
        ) : airportRecentsOpen && !typing ? (
          <TabPage>
            <Waits>
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
            </Waits>
          </TabPage>
        ) : routeRecentsOpen ? (
          <TabPage>
            <Waits>
              <RecentRoutesPage onBack={closeList} />
            </Waits>
          </TabPage>
        ) : savedOpen ? (
          <TabPage>
            <Waits>
              <SavedFlights onBack={closeSaved} />
            </Waits>
          </TabPage>
        ) : model.typed || model.direct || (model.pick && model.does.length > 0) ? (
          // A search sent, its results, else the suggestions: each its own scroll box (one scrolling rule);
          // a picker's ask with a row before anything is typed too (the departure's My Location).
          <TabPage key={model.sent ? "results" : "suggestions"}>
            <Waits>{model.sent ? <SearchResultsPage /> : <OneSearchResults model={model} />}</Waits>
          </TabPage>
        ) : (
          stripsDrawn && (
            <SearchHome vm={vm} pickIdent={model.pick ? model.pickIdent : undefined} refusal={model.pick ? model.refusal : undefined} />
          )
        )}
      </TabKept>
    </>
  );
}
