import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import type { PanelState } from "../../../lib/mapChrome";
import { identOf } from "../../../lib/identSchema";
import { usePreferences, type RecentAirport } from "../../../lib/preferences";
import { airportQuery, queryClient } from "../../../lib/queryClient";
import { useTabSearch } from "../lib/tabSearch";
import { useAirportSearch } from "../../../lib/useAirportSearch";
import { patched } from "../../../lib/useSearchParamsNow";
import type { PanelTab } from "./useTabCards";

/**
 * The search bars of the planner's tabs (usePlanWorkspace): Airport's,
 * which opens a field's card or makes it Home or a Favorite; Aircraft's
 * and Nearest's, whose text lives in features/plan/lib/tabSearch; the Adds that focus
 * them without moving the panel; and Favorites brought in by a link.
 */
export function useSearchPanel({ tab, selectPlace, listAway, panel, setPanel, searchParams, setSearchParams }: {
  tab: PanelTab;
  selectPlace: (ident: string | null) => void;
  /** A list in full put away, where it is the one open. */
  listAway: (name: "favorites") => void;
  panel: PanelState;
  setPanel: (state: PanelState) => void;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}) {
  // The route's box and its nav log are FPL's, a route or none -- with none
  // the box is empty to type one in, at the pilot's ask.
  const started = tab === "fpl";
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<"place" | "home" | "favorite">("place");
  const searchInput = useRef<HTMLInputElement>(null);
  const search = useAirportSearch(query, !started);
  const { addRecentAirport: addRecent, setHomeAirport, toggleFavoriteAirport, moveFavoriteAirport } = usePreferences.getState();
  const home = usePreferences(p => p.homeAirport);
  const favorites = usePreferences(p => p.favoriteAirports);
  const pickPlace = useCallback(async (airport: RecentAirport) => {
    setQuery("");
    (document.activeElement as HTMLElement | null)?.blur();
    if (picking === "place") {
      addRecent(airport);
      selectPlace(airport.ident);
      return;
    }
    // Where it is, for how far it is from own ship.
    const full = await queryClient.fetchQuery(airportQuery(airport.ident)).catch(() => null);
    const kept = full ? { ident: full.ident, name: full.name, municipality: full.municipality, lat: full.lat, lon: full.lon } : airport;
    if (picking === "home") setHomeAirport(kept);
    else if (!favorites.some(a => a.ident === kept.ident)) toggleFavoriteAirport(kept);
    setPicking("place");
  }, [picking, addRecent, selectPlace, setHomeAirport, toggleFavoriteAirport, favorites]);
  // An Add's focus on a search field leaves the panel the height it is,
  // at the owner's ask ("Clicking on any button in half card should not
  // open the full card"): what is typed in it then takes it up, where
  // the answers are. A finger's own tap on the field takes it up at once.
  const quietFocus = useRef(false);
  const focusQuietly = (field: (() => void) | undefined) => {
    quietFocus.current = true;
    field?.();
    quietFocus.current = false;
  };
  // Favorites' Add, Home's or another's: the search bar asks for the
  // field, focused within the tap so the keyboard comes up.
  const askFor = (what: "home" | "favorite") => {
    setPicking(what);
    listAway("favorites");
    focusQuietly(() => searchInput.current?.focus());
  };
  // Home's, My Airplane's or the airplane Favorites' Add on the pill: the
  // search asked for it, focused within the tap, the panel where it is.
  const addFromPill = (what: "home" | "mine" | "airplane") => {
    if (what === "home") {
      askFor("home");
      return;
    }
    useTabSearch.setState({ pickingMine: what === "mine", pickingFavorite: what === "airplane" });
    focusQuietly(useTabSearch.getState().focusAircraft ?? undefined);
  };
  const upAsTyped = (typed: string) => { if (typed && panel === "peek") setPanel("full"); };

  // Aircraft's and Nearest's fields, the search bar's shape (SearchField) in
  // the same place, what is typed kept in features/plan/lib/tabSearch for their lists.
  const aircraftTyped = useTabSearch(t => t.aircraft);
  const pickingMine = useTabSearch(t => t.pickingMine);
  const pickingFavorite = useTabSearch(t => t.pickingFavorite);
  // An Add on the pill (addFromPill) focuses the field once the panel is
  // up and the field is drawn.
  const aircraftInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    useTabSearch.setState({ focusAircraft: () => aircraftInput.current?.focus() });
    return () => useTabSearch.setState({ focusAircraft: null });
  }, []);
  const nearTyped = useTabSearch(t => t.near);

  // A link that brings favorites with it -- ?favorites=KORD,KMKE&home=C81
  // -- adds them to this browser's, so a set made on one device (or sent
  // to try) arrives on another; the address drops them once read.
  const seeded = useRef(false);
  useEffect(() => {
    const listed = searchParams.get("favorites");
    const homeListed = searchParams.get("home");
    if (seeded.current || (!listed && !homeListed)) return;
    seeded.current = true;
    const look = (ident: string) => queryClient.fetchQuery(airportQuery(ident)).then(a => ({ ident: a.ident, name: a.name, municipality: a.municipality, lat: a.lat, lon: a.lon })).catch(() => null);
    void (async () => {
      for (const ident of (listed ?? "").split(",").map(identOf).filter(Boolean)) {
        if (usePreferences.getState().favoriteAirports.some(a => a.ident === ident)) continue;
        const airport = await look(ident);
        if (airport) usePreferences.getState().toggleFavoriteAirport(airport);
      }
      const home = homeListed && await look(identOf(homeListed));
      if (home) usePreferences.getState().setHomeAirport(home);
      setSearchParams(prev => {
        return patched(prev, { favorites: null, home: null });
      }, { replace: true });
    })();
  }, [searchParams, setSearchParams]);
  return {
    query, setQuery, picking, setPicking, searchInput, search, pickPlace, quietFocus, askFor, addFromPill, upAsTyped,
    aircraftTyped, pickingMine, pickingFavorite, aircraftInput, nearTyped, home, favorites, setHomeAirport, toggleFavoriteAirport,
    moveFavoriteAirport,
  };
}
