import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, SetAddress } from "../../../lib/address";
import { identOf } from "../../../lib/identSchema";
import { usePreferences, type KeptAircraft, type RecentAirport } from "../../../lib/preferences";
import { airportQuery, queryClient } from "../../../lib/queryClient";
import { useTabSearch } from "../lib/tabSearch";
import { useAirportSearch } from "../../../lib/useAirportSearch";
import type { PanelView } from "./usePanelView";

/**
 * The planner's search fields (usePlanWorkspace): the one search, whose
 * airport opens its card or is made Home or a Favorite, and whose airplane
 * opens its card or is made the pilot's Airplane or a Favorite; Nearest's,
 * whose text lives in features/plan/lib/tabSearch; the Adds that focus
 * them; and Favorites brought in by a link. No field's focus
 * or typing moves the sheet (the owner, 2026-11-11: "Whenever I try to
 * type on search bar it takes the card to full screen"): it stays where
 * the pilot put it, the keyboard placed by the Drawer's
 * VirtualKeyboardProvider.
 */
export function useSearchPanel({
  view,
  selectPlace,
  listAway,
  address,
  setAddress,
}: {
  view: PanelView;
  selectPlace: (ident: string | null) => void;
  /** A list in full put away, where it is the one open. */
  listAway: (name: "favorites") => void;
  address: Address;
  setAddress: SetAddress;
}) {
  const [query, setQuery] = useState("");
  // What the one search is asked for: a place to open, Home or a Favorite
  // airport to keep, the pilot's Airplane or a Favorite airplane to keep.
  const [picking, setPicking] = useState<"place" | "home" | "favorite" | "mine" | "airplane">("place");
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
      if (picking !== "home" && picking !== "favorite") {
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
  // Favorites' Add, Home's or another's, an airport's or an airplane's: the
  // one search asks for it, focused within the tap so the keyboard comes
  // up, its words saying what for (lib/searchPlaceholder). The airplanes'
  // had a search page of their own, the traffic's, gone for this one.
  const askFor = (what: "home" | "favorite" | "mine" | "airplane") => {
    setPicking(what);
    listAway("favorites");
    searchInput.current?.focus();
  };
  // A kept airplane picked -- a Recent, a Favorite, one found -- kept as the
  // pilot's Airplane or a Favorite where the search was asked for one, and
  // otherwise opened: one rule wherever airplanes are picked from (the one
  // search's rows, its page's tiles, the lists in full).
  const pickAirplane = useCallback(
    (kept: KeptAircraft, open: (hex: string) => void) => {
      const prefs = usePreferences.getState();
      if (picking === "mine") prefs.setMyAircraft(kept);
      else if (picking === "airplane") {
        if (!prefs.favoriteAircraft.some((a) => a.hex === kept.hex)) prefs.toggleFavoriteAircraft(kept);
      } else {
        open(kept.hex);
        return;
      }
      setQuery("");
      setPicking("place");
      (document.activeElement as HTMLElement | null)?.blur();
    },
    [picking],
  );
  const nearTyped = useTabSearch((t) => t.near);

  // A link that brings favorites with it -- ?favorites=KORD,KMKE&home=C81
  // -- adds them to this browser's, so a set made on one device (or sent
  // to try) arrives on another; the address drops them once read.
  const seeded = useRef(false);
  useEffect(() => {
    const listed = address.favorites;
    const homeListed = address.home;
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
      void setAddress({ favorites: null, home: null });
    })();
  }, [address, setAddress]);
  return {
    query,
    setQuery,
    picking,
    setPicking,
    searchInput,
    search,
    pickPlace,
    askFor,
    pickAirplane,
    nearTyped,
    home,
    favorites,
    setHomeAirport,
    toggleFavoriteAirport,
    moveFavoriteAirport,
  };
}
