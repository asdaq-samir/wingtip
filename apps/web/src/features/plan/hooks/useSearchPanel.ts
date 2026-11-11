import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";
import { identOf } from "../../../lib/identSchema";
import { usePreferences, type RecentAirport } from "../../../lib/preferences";
import { airportQuery, queryClient } from "../../../lib/queryClient";
import { useTabSearch } from "../lib/tabSearch";
import { useAirportSearch } from "../../../lib/useAirportSearch";
import { patched } from "../../../lib/useSearchParamsNow";
import type { PanelView } from "./usePanelView";

/**
 * The planner's search fields (usePlanWorkspace): the one search, whose
 * airport opens its card or is made Home or a Favorite; the traffic's and
 * Nearest's, whose text lives in features/plan/lib/tabSearch; the Adds
 * that focus them; and Favorites brought in by a link. No field's focus
 * or typing moves the sheet (the owner, 2026-11-11: "Whenever I try to
 * type on search bar it takes the card to full screen"): it stays where
 * the pilot put it, the keyboard placed by the Drawer's
 * VirtualKeyboardProvider.
 */
export function useSearchPanel({
  view,
  selectPlace,
  listAway,
  searchParams,
  setSearchParams,
}: {
  view: PanelView;
  selectPlace: (ident: string | null) => void;
  /** A list in full put away, where it is the one open. */
  listAway: (name: "favorites") => void;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}) {
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<"place" | "home" | "favorite">("place");
  const searchInput = useRef<HTMLInputElement>(null);
  // The one search's airports and, with them, the waypoints and navaids
  // (its Waypoints and Navaids group), asked while it is the place up.
  const search = useAirportSearch(query, view === "search", true);
  const { addRecentAirport: addRecent, setHomeAirport, toggleFavoriteAirport, moveFavoriteAirport } = usePreferences.getState();
  const home = usePreferences((p) => p.homeAirport);
  const favorites = usePreferences((p) => p.favoriteAirports);
  const pickPlace = useCallback(
    async (airport: RecentAirport) => {
      (document.activeElement as HTMLElement | null)?.blur();
      // A place's card: what was typed kept for the way back, as Apple
      // Maps' card closed goes back to its search with its words (the card
      // rule, 2026-11-10), as a waypoint's card already did.
      if (picking === "place") {
        addRecent(airport);
        selectPlace(airport.ident);
        return;
      }
      // Home or a Favorite picked: the words let go with the ask.
      setQuery("");
      // Where it is, for how far it is from own ship.
      const full = await queryClient.fetchQuery(airportQuery(airport.ident)).catch(() => null);
      const kept = full ? { ident: full.ident, name: full.name, municipality: full.municipality, lat: full.lat, lon: full.lon } : airport;
      if (picking === "home") setHomeAirport(kept);
      else if (!favorites.some((a) => a.ident === kept.ident)) toggleFavoriteAirport(kept);
      setPicking("place");
    },
    [picking, addRecent, selectPlace, setHomeAirport, toggleFavoriteAirport, favorites],
  );
  // Favorites' Add, Home's or another's: the search bar asks for the
  // field, focused within the tap so the keyboard comes up.
  const askFor = (what: "home" | "favorite") => {
    setPicking(what);
    listAway("favorites");
    searchInput.current?.focus();
  };
  // Home's, My Airplane's or the airplane Favorites' Add on the pill: the
  // search asked for it, focused within the tap.
  const addFromPill = (what: "home" | "mine" | "airplane") => {
    if (what === "home") {
      askFor("home");
      return;
    }
    useTabSearch.setState({ pickingMine: what === "mine", pickingFavorite: what === "airplane" });
    useTabSearch.getState().focusAircraft?.();
  };

  // Aircraft's and Nearest's fields, the search bar's shape (SearchField) in
  // the same place, what is typed kept in features/plan/lib/tabSearch for their lists.
  const aircraftTyped = useTabSearch((t) => t.aircraft);
  const pickingMine = useTabSearch((t) => t.pickingMine);
  const pickingFavorite = useTabSearch((t) => t.pickingFavorite);
  // An Add on the pill (addFromPill) focuses the field once the panel is
  // up and the field is drawn.
  const aircraftInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    useTabSearch.setState({ focusAircraft: () => aircraftInput.current?.focus() });
    return () => useTabSearch.setState({ focusAircraft: null });
  }, []);
  const nearTyped = useTabSearch((t) => t.near);

  // A link that brings favorites with it -- ?favorites=KORD,KMKE&home=C81
  // -- adds them to this browser's, so a set made on one device (or sent
  // to try) arrives on another; the address drops them once read.
  const seeded = useRef(false);
  useEffect(() => {
    const listed = searchParams.get("favorites");
    const homeListed = searchParams.get("home");
    if (seeded.current || (!listed && !homeListed)) return;
    seeded.current = true;
    const look = (ident: string) =>
      queryClient
        .fetchQuery(airportQuery(ident))
        .then((a) => ({ ident: a.ident, name: a.name, municipality: a.municipality, lat: a.lat, lon: a.lon }))
        .catch(() => null);
    void (async () => {
      for (const ident of (listed ?? "").split(",").map(identOf).filter(Boolean)) {
        if (usePreferences.getState().favoriteAirports.some((a) => a.ident === ident)) continue;
        const airport = await look(ident);
        if (airport) usePreferences.getState().toggleFavoriteAirport(airport);
      }
      const home = homeListed && (await look(identOf(homeListed)));
      if (home) usePreferences.getState().setHomeAirport(home);
      setSearchParams(
        (prev) => {
          return patched(prev, { favorites: null, home: null });
        },
        { replace: true },
      );
    })();
  }, [searchParams, setSearchParams]);
  return {
    query,
    setQuery,
    picking,
    setPicking,
    searchInput,
    search,
    pickPlace,
    askFor,
    addFromPill,
    aircraftTyped,
    pickingMine,
    pickingFavorite,
    aircraftInput,
    nearTyped,
    home,
    favorites,
    setHomeAirport,
    toggleFavoriteAirport,
    moveFavoriteAirport,
  };
}
