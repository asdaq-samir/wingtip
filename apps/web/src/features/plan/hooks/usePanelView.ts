import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useEffectEvent } from "react";
import type { SetURLSearchParams } from "react-router";
import { useConsoleOpen, type PanelState } from "../../../lib/mapChrome";
import type { TrafficAircraft } from "../../../lib/api/types";
import { pointOf } from "../../../lib/airspace";
import { identOf } from "../../../lib/identSchema";
import { choosePastFlight, clearPastFlight, usePastFlight } from "../map/pastFlight";
import { track, useTracking } from "../../../lib/map/position/tracking";
import { patched } from "../../../lib/useSearchParamsNow";
import { usePickAirplaneRequest } from "./usePickAirplaneRequest";
import { riseToSee } from "./panelNow";

/**
 * What the planner's sheet shows under its one search (the owner's
 * approved one-search design, 2026-11-09, which replaced the FPL, Airport,
 * Airplane and Setup tabs) and the cards open over it, apart from the
 * route the workspace plans (PlanWorkspace).
 */

/** The sheet's three places under the search: the plan (the route, its
 *  figures and its nav log, the sheet's main content); the search's own
 *  page (nothing typed: the flight, Favorites, Recents and Nearest; typed:
 *  the results, grouped); and the traffic about, opened from the search's
 *  Do or an airplane tapped on the map. */
export type PanelView = "plan" | "search" | "traffic";

/** The address's keys of what is open over the sheet: an airport's card,
 *  the airspace over a point held, an airplane, its past flight, Nearest's
 *  list and its place, the saved flights, the lists in full (`list`) and
 *  the Brief. */
const CARD_KEYS = ["place", "at", "flight", "past", "near", "nearAt", "nearName", "saved", "list", "brief"] as const;

/** A list in full, from its section's title, in the address
 *  (`?list=favorites`): the airports' Favorites and Recents, the routes
 *  planned, the airplanes' Favorites and Recents. Saved and Nearest have
 *  keys of their own (`saved`, `near`). */
const LISTS = ["favorites", "recents", "routes", "aircraft-favorites", "aircraft-recents"] as const;
export type PanelList = (typeof LISTS)[number];

/**
 * The cards the address holds, so a link or Back lands on them: an
 * airport's (`place`), the airspace over a point held (`at`), Nearest's list
 * (`near`) and the place it is from (`nearAt`, `nearName`), Aircraft's
 * list (`aircraft`), an airplane tracked (`flight`) and one of its past
 * flights (`past`) -- and the ways to open and put away the airplane's
 * and its past flight's; the airport's is the workspace's (selectPlace),
 * which the route's Approaches ask for too.
 */
export function useAddressCards(searchParams: URLSearchParams, setSearchParams: SetURLSearchParams, setPanel: (state: PanelState) => void) {
  // A list in full over its tab, as a card is: in the address, so it is
  // kept for its tab and opened again on coming back to it and after
  // Setup, and a link to it lands on it, at the owner's pick ("Yes to
  // both": lists keep their place as cards do), where four were the
  // workspace's own state, put away at any tab picked, and one the
  // Aircraft card's. A reload starts clean, cards and lists alike
  // (features/shell/freshLoad).
  const listParam = searchParams.get("list");
  const list = (LISTS as readonly string[]).includes(listParam ?? "") ? (listParam as PanelList) : null;
  const openList = useCallback(
    (name: PanelList) => {
      setSearchParams(
        (prev) => {
          return patched(prev, { list: name });
        },
        { replace: true },
      );
      // From the pill up to half, so it is seen; else the sheet stays the
      // size the pilot left it (the owner, 2026-11-11).
      riseToSee(setPanel);
    },
    [setSearchParams, setPanel],
  );
  const closeList = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { list: null });
      },
      { replace: true },
    );
  }, [setSearchParams]);
  // The airport whose card is open in the panel (PlaceCard), as Maps
  // opens a place's: from a tap on the chart, held in the address so a
  // link lands on it. Opened from the map at the pill's size, as its
  // summary; putting it away leaves the panel where it is, the layer under
  // it in sight.
  const place = identOf(searchParams.get("place")) || null;
  // Or the point a finger was held on, for the airspace over it
  // (AirspaceCard): `?at=42.3172,-88.0905`. One card at a time: either
  // puts the other away, and a tap on the chart puts both away.
  const atParam = searchParams.get("at");
  const heldPoint = useMemo(() => pointOf(atParam), [atParam]);
  // Or the fields nearest own ship (NearestCard), Airport's NEAREST list:
  // `?near=1`, a card of its own in the panel, with the map fitted to
  // them, at the pilot's ask. An airport opened from it
  // is a layer over it, its close back to the list.
  const nearOpen = searchParams.get("near") === "1";
  // Or the aircraft about and a search for one (AircraftCard), the tab
  // bar's Aircraft: `?aircraft=1`; and one airplane tracked
  // (FlightCard), by its ICAO address: `?flight=a0b7d8` -- a layer over
  // the list where it was picked from it, as an airport's over Nearest.
  const aircraftOpen = searchParams.get("aircraft") === "1";
  const flightParam = searchParams.get("flight");
  const flight = flightParam && /^~?[0-9a-f]{6}$/i.test(flightParam) ? flightParam.toLowerCase() : null;
  // And one of its past flights (PastFlightCard), by its takeoff's time:
  // `?past=1791723840` -- a layer over the airplane's card, its close back
  // to it, at the pilot's ask.
  const pastParam = searchParams.get("past");
  const past = flight && pastParam && /^\d{9,11}$/.test(pastParam) ? Number(pastParam) : null;
  // Or near a place the pilot typed in it -- a town, an address, an
  // airport -- at the pilot's ask, where it was own ship's alone:
  // `?nearAt=43.0731,-89.4012&nearName=Madison, WI`.
  const nearAtParam = searchParams.get("nearAt");
  const nearNameParam = searchParams.get("nearName");
  const nearFrom = useMemo(() => {
    const at = pointOf(nearAtParam);
    return at ? { ...at, label: nearNameParam ?? `${at.lat}, ${at.lon}` } : null;
  }, [nearAtParam, nearNameParam]);
  const setNearFrom = useCallback(
    (from: { label: string; lat: number; lon: number } | null) => {
      setSearchParams(
        (prev) => {
          return patched(
            prev,
            from ? { nearAt: `${from.lat.toFixed(4)},${from.lon.toFixed(4)}`, nearName: from.label } : { nearAt: null, nearName: null },
          );
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const selectFlight = useCallback(
    (hex: string | null, plane?: TrafficAircraft) => {
      track(hex, plane);
      setSearchParams(
        (prev) => {
          // An airplane's card half way, wherever it is opened from, as an
          // airport's is (the owner's ask; FlightCard's `opens`).
          return patched(prev, {
            flight: hex ?? null,
            place: null,
            at: null,
            near: null,
            nearAt: null,
            nearName: null,
            past: null,
            view: hex ? null : undefined,
          });
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const selectPast = useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          return patched(prev, { past: id ? String(id) : null });
        },
        { replace: true },
      );
      // A past flight: its card all the way up (PastFlightCard's `opens`).
    },
    [setSearchParams],
  );
  // The address's flight and list into the tracking the map draws from
  // (lib/map/position/tracking), and the map's tap on an airplane back to here.
  useEffect(() => {
    track(flight);
  }, [flight]);
  // Each put back on its own: `pick` changes with the panel's setter, and
  // putting `listing` back with it hid the traffic while the list was up.
  // Not while Setup is up over the Airplane tab: the list is out of sight,
  // and the traffic asked for it every few seconds with it (lib/shown).
  const setupUp = useConsoleOpen((st) => st.open);
  const listing = aircraftOpen && !setupUp;
  useEffect(() => {
    useTracking.setState({ listing });
    return () => useTracking.setState({ listing: false });
  }, [listing]);
  useEffect(() => {
    useTracking.setState({ pick: (hex, plane) => selectFlight(hex, plane) });
    return () => useTracking.setState({ pick: null });
  }, [selectFlight]);
  return {
    place,
    heldPoint,
    nearOpen,
    aircraftOpen,
    flight,
    past,
    nearFrom,
    setNearFrom,
    selectFlight,
    selectPast,
    list,
    openList,
    closeList,
  };
}

/**
 * The place up under the search and the ways to change it. The traffic
 * and an airplane's card are the address's (`aircraft`, `flight`), and so
 * are the search's lists in full (`list`, `saved`, `near`), so a link or
 * Back lands on them; the plan and the search are picked. With a route the
 * plan is up, the sheet's main content, and a new route -- Fly Here, a
 * link, one typed -- brings it back to the front; with none, the search's
 * own page is.
 *
 * Each place keeps what was open over it when it was left -- an airport's
 * card, an airplane's, a past flight and where its replay was -- and opens
 * it again on coming back, as before. Not past a reload.
 */
export function usePanelView({
  cards,
  route,
  hasRoute,
  searchParams,
  setSearchParams,
}: {
  cards: ReturnType<typeof useAddressCards>;
  /** The route as the address has it, any change of which is a new one. */
  route: string;
  hasRoute: boolean;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}) {
  const { place, heldPoint, flight, past, aircraftOpen, nearOpen, list } = cards;
  const savedOpen = searchParams.get("saved") === "1";
  const [viewPick, setViewPick] = useState<PanelView | null>(null);
  const [routeSeen, setRouteSeen] = useState(route);
  if (route !== routeSeen) {
    setRouteSeen(route);
    if (hasRoute) setViewPick("plan");
  }
  // A field, a point or an airplane opened while the account's page is up
  // -- a tap on the map, which it leaves in sight on a phone -- puts the
  // page away and opens the card.
  const opened = `${place ?? ""}|${heldPoint ? JSON.stringify(heldPoint) : ""}|${flight ?? ""}`;
  // Before the frame is drawn: after it, the account's page stood a frame
  // over the card just opened.
  const closeConsole = useEffectEvent(() => {
    if ((place || heldPoint || flight) && useConsoleOpen.getState().open) useConsoleOpen.getState().setOpen(false);
  });
  // Once per card opened, not as the page opens over one already open.
  useLayoutEffect(() => closeConsole(), [opened]);
  // The traffic by the address; the search's lists in full are the
  // search's; else the place picked, the plan where there is a route and
  // the search's page where there is none.
  const view: PanelView =
    flight || aircraftOpen
      ? "traffic"
      : nearOpen || savedOpen || list === "favorites" || list === "recents" || list === "routes"
        ? "search"
        : (viewPick ?? (hasRoute ? "plan" : "search"));

  const keptCards = useRef<Partial<Record<PanelView, [string, string][]>>>({});
  const keptReplay = useRef<{ hex: string; id: number; at: number | null; playing: boolean } | null>(null);
  // The address's past flight drawn on the map (features/plan/map/pastFlight), and
  // let go with its card; back on its place, the replay where it was,
  // playing if it was.
  useEffect(() => {
    if (flight && past) {
      choosePastFlight(flight, past);
      const kept = keptReplay.current;
      if (kept && kept.hex === flight && kept.id === past) usePastFlight.setState({ at: kept.at, playing: kept.playing });
      keptReplay.current = null;
    } else clearPastFlight();
  }, [flight, past]);

  // A place picked -- the flight's card, the search focused, the traffic
  // from the search's Do -- the card open over the one it was on kept for
  // it and the one kept for the place picked opened again. The place up
  // picked again puts its card away. At the height the panel is.
  const pickView = useCallback(
    (next: PanelView) => {
      const leaving = next !== view;
      if (leaving) {
        keptCards.current[view] = CARD_KEYS.flatMap((key) => {
          const value = searchParams.get(key);
          return value ? [[key, value] as [string, string]] : [];
        });
        const replay = usePastFlight.getState();
        if (flight && past && replay.hex === flight && replay.id === past) {
          keptReplay.current = { hex: flight, id: past, at: replay.at, playing: replay.playing };
        }
      } else delete keptCards.current[view];
      const back = leaving ? (keptCards.current[next] ?? []) : [];
      setViewPick(next);
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          for (const key of [...CARD_KEYS, "aircraft", "near"]) out.delete(key);
          if (next === "traffic") out.set("aircraft", "1");
          for (const [key, value] of back) out.set(key, value);
          return out;
        },
        // In the same commit as the pick, not in the router's transition
        // after it: in between, the sheet drew the place the address still
        // had for a frame.
        { replace: true, flushSync: true },
      );
    },
    [setSearchParams, searchParams, view, flight, past],
  );

  // The workspace's own picks (a card's button, the radio's "nearest", a
  // route cleared) come with an address change -- a card put away, a list
  // opened -- which the router makes in a transition. The pick in the same
  // transition, so the two land in one commit. Transitions started in one
  // event share their lane, so they commit together.
  const pickLater = useCallback((next: PanelView) => startTransition(() => setViewPick(next)), []);
  // "Pick an airplane" asked from a screen that needs one (lib/pickAirplane).
  usePickAirplaneRequest(pickView);
  return { view, setViewPick: pickLater, pickView };
}
