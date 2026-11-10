import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import { aircraftKey, choiceOf, N_NUMBER } from "../../../lib/aircraftChoice";
import { openAirplaneProfile } from "../../../lib/airplane/profileStore";
import { useAsk } from "../../../lib/ask/useAsk";
import { useRadioActions } from "../../../lib/atcRadio";
import { SCREENS, type ScreenId } from "../../../lib/navigation/generated/screens";
import { wantScreen } from "../../../lib/navigation/wanted";
import { takeSearchAsk, useSearchAsk } from "../../../lib/oneSearch";
import { usePreferences, type KeptAircraft } from "../../../lib/preferences";
import { aircraftListQuery, aircraftProfilesQuery, pilotQuery } from "../../../lib/queryClient";
import type { AirportSearchRow } from "../../../lib/useAirportSearch";
import { SCREEN_KEYS, DIRECT_KEY } from "../../../hooks/use-shortcuts";
import { useAirportIndex } from "../../../lib/airportIndex";
import { readQuery } from "../lib/searchFilters";
import { nearOf, useSearchResults } from "./useSearchResults";
import type { PlanWorkspaceModel } from "./usePlanWorkspace";

/** One airplane the search found: the pilot's own (their record, or one
 *  kept on this device), one the FAA's registry has by the N-number typed,
 *  or a type the planner has a book for. */
export interface AirplaneHit {
  key: string;
  title: string;
  detail: string;
  pick: () => void;
  /** The plan flown in it: one of the pilot's own airplanes, picked as
   *  the plan's airplane straight from the result (the top hit's "Fly This
   *  Airplane", Apple Maps' quick actions in a result, 2026-11-10). */
  fly?: () => void;
}

/** One thing to do: an action, a screen, a question for the assistant, or
 *  the words typed sent as a search round a place (Apple Maps' "Search
 *  Nearby" suggestion, the owner's screenshot, 2026-11-10). */
export interface DoHit {
  key: string;
  label: string;
  keys?: string;
  kind: "action" | "screen" | "ask" | "nearby";
  run: () => void;
}

/** The screens the search's Do offers by their titles: a link opens any of
 *  them, and none of them needs an argument (a shared flight does). The
 *  tabs that were are the search, the plan and the account, which the
 *  sheet has without a row. */
const OFFERED: ScreenId[] = [
  "brief",
  "navlog",
  "profile",
  "nearest",
  "emergency",
  "flights",
  "favorites",
  "checklists",
  "airplanes",
  "logbook",
  "coach",
  "minimums",
  "guide",
  "about",
];

/** What is typed found in a name, ignoring case. */
const finds = (typed: string, name: string) => name.toLowerCase().includes(typed.toLowerCase());

/** The registration typed, the N first, in the FAA's capitals. */
const tailTyped = (typed: string) => {
  const t = typed.trim().toUpperCase().replace(/\s+/g, "");
  return N_NUMBER.test(t) ? (t.startsWith("N") ? t : `N${t}`) : null;
};

/**
 * The one search's view model (the owner's one-search design, 2026-11-09),
 * over the planner's (usePlanWorkspace): what is typed -- the planner's own
 * query, so an Add for Home or a Favorite asks through the same field --
 * and, for it, the results in their groups: Airports, Waypoints and
 * navaids (the planner's airport search with its fixes), Airplanes (the
 * pilot's own, the FAA registry's by the N-number typed, a type) and Do
 * (Direct To, the Brief, Nearest, the emergency, the traffic, every screen
 * by its name, and "Ask:" for the assistant). Nothing here works a figure
 * out: each pick opens a card, a profile or a screen that does. With
 * nothing typed the field's page is SearchHome's. Direct To, asked by D or
 * its row, takes the next airport picked as where to fly.
 */
export function useOneSearch(vm: PlanWorkspaceModel) {
  const {
    query,
    setQuery,
    search,
    pickPlace,
    routed,
    pickView,
    setPanel,
    picking,
    setPicking,
    place,
    selectPlace,
    selectFlight,
    listAway,
    flyHere,
    departFrom,
    changeAircraft,
  } = vm;
  const typed = query.trim();
  // A search sent (useSearchResults): its list in the sheet while the
  // field is not being typed in, its fields on the map.
  const sent = useSearchResults((s) => s.sent);
  const index = useAirportIndex(true, typed.length > 0);
  const [direct, setDirect] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const directTo = useRadioActions((s) => s.directTo);

  // The pilot's own airplanes: their records signed in, and the ones kept
  // on this device (their Airplane, Favorites and Recents, by ICAO address).
  const { data: pilot } = useQuery(pilotQuery);
  const { data: records } = useQuery({ ...aircraftListQuery, enabled: !!pilot });
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const mine = usePreferences((p) => p.myAircraft);
  const favoriteAircraft = usePreferences((p) => p.favoriteAircraft);
  const recentAircraft = usePreferences((p) => p.recentAircraft);
  const tail = direct ? null : tailTyped(typed);
  const ownTail = !!tail && !!records?.some((r) => r.tailNumber.toUpperCase() === tail);
  // The registry's by the N-number typed, where it is none of the pilot's:
  // the profile's own lookup (useAirplaneProfile), so its answer is kept
  // for the profile it opens.
  const registry = useQuery({
    queryKey: ["registered", tail ?? ""],
    queryFn: () => api.trafficFind(tail!),
    staleTime: 24 * 60 * 60_000,
    enabled: !!tail && !ownTail,
    meta: { silent: true },
  });

  const airplanes = useMemo<AirplaneHit[]>(() => {
    if (!typed || direct) return [];
    const out: AirplaneHit[] = [];
    for (const r of records ?? []) {
      if (finds(typed, r.tailNumber) || finds(typed, r.typeDesignator))
        out.push({
          key: `own-${r.tailNumber}`,
          title: r.tailNumber,
          detail: `${r.typeDesignator} · Your airplane`,
          pick: () => openAirplaneProfile(r.tailNumber),
          fly: () => changeAircraft(aircraftKey(choiceOf(r, profiles ?? []))),
        });
    }
    const kept = new Map<string, KeptAircraft>();
    for (const a of [mine, ...favoriteAircraft, ...recentAircraft]) if (a && !kept.has(a.hex)) kept.set(a.hex, a);
    for (const a of kept.values()) {
      if (out.some((o) => o.title === a.name.toUpperCase())) continue;
      if (finds(typed, a.name) || (a.type && finds(typed, a.type)))
        out.push({
          key: `kept-${a.hex}`,
          title: a.name,
          detail: [a.type, a.hex === mine?.hex ? "Your airplane" : "Kept"].filter(Boolean).join(" · "),
          pick: () => selectFlight(a.hex),
        });
    }
    const registered = registry.data?.registered;
    if (tail && !ownTail && !out.some((o) => o.title === tail))
      out.push({
        key: `registry-${tail}`,
        title: tail,
        detail: registered
          ? [registered.manufacturer, registered.model].filter(Boolean).join(" ") + " · FAA registry"
          : registry.isFetching
            ? "Looking it up in the FAA registry…"
            : "Its profile, to fly it",
        pick: () => openAirplaneProfile(tail),
      });
    // A type the planner flies by its book: flown by an N-number of the
    // pilot's, so its row goes to their airplanes, where one is added.
    for (const p of profiles ?? []) {
      if (out.length >= 6) break;
      if (typed.length >= 2 && (finds(typed, p.name) || finds(typed, p.type)))
        out.push({
          key: `type-${p.name}`,
          title: p.name.toUpperCase(),
          detail: `${p.type} · Add your N-number to fly it`,
          pick: () => wantScreen("airplanes"),
        });
    }
    return out;
  }, [
    typed,
    direct,
    records,
    mine,
    favoriteAircraft,
    recentAircraft,
    tail,
    ownTail,
    registry.data,
    registry.isFetching,
    profiles,
    selectFlight,
    changeAircraft,
  ]);

  const airports = useMemo(() => search.rows.filter((r) => r.kind !== "fix"), [search.rows]);
  const waypoints = useMemo(() => (direct ? [] : search.rows.filter((r) => r.kind === "fix")), [direct, search.rows]);

  // Done with the field: what is typed let go, the field and Direct To put
  // away, and the place under it as it was (the plan where there is one).
  const done = () => {
    useSearchResults.getState().clear();
    setQuery("");
    setDirect(false);
    setProblem(null);
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const flyDirect = async (ident: string) => {
    const why = directTo ? await directTo(ident) : "Direct To needs a route or the airplane's position.";
    if (why) setProblem(why);
    else {
      done();
      pickView("plan");
    }
  };

  const does: DoHit[] = [];
  if (!direct) {
    const out = does;
    const first = airports[0];
    // Direct To the first airport found, where the radio can fly one.
    if (first && directTo)
      out.push({ key: "direct-first", label: `Direct to ${first.ident}`, kind: "action", run: () => void flyDirect(first.ident) });
    const actions: DoHit[] = [
      { key: "direct", label: "Direct To…", keys: DIRECT_KEY, kind: "action", run: () => (setDirect(true), setQuery("")) },
      { key: "traffic", label: "Traffic Nearby", kind: "action", run: () => (done(), pickView("traffic"), setPanel("half")) },
    ];
    for (const a of actions) if (!typed || finds(typed, a.label)) if (a.key !== "direct" || directTo) out.push(a);
    for (const id of OFFERED) {
      const title = SCREENS[id].title;
      if (typed && !finds(typed, title)) continue;
      if (!typed && !SCREEN_KEYS[id] && id !== "emergency") continue;
      out.push({ key: `screen-${id}`, label: title, keys: SCREEN_KEYS[id], kind: "screen", run: () => (done(), wantScreen(id)) });
    }
    // The words typed sent as a search round a place, Apple's "Search
    // Nearby" row, first of the suggestions.
    if (typed) out.push({ key: "nearby", label: typed, kind: "nearby", run: () => send(typed) });
    if (typed) out.push({ key: "ask", label: `Ask: “${typed}”`, kind: "ask", run: () => ask(typed) });
  }

  // Sent: round the place it names, else own ship or Nearest's place, else
  // the departure (nearOf); the field let go, what was typed kept in it.
  const send = (text: string) => {
    const near = nearOf(
      text,
      index,
      vm.nearOrigin ? { label: vm.nearFrom?.label ?? "your position", ...vm.nearOrigin } : null,
      vm.planned.dep,
    );
    if (!near) {
      setProblem('Name a field to search round ("near KMSN"), or turn on your position.');
      return;
    }
    setProblem(null);
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
    useSearchResults.getState().send(text, near, readQuery(text).filters, (ident) => selectPlace(ident));
    pickView("search");
    setPanel("half");
  };

  // The question to the assistant (lib/ask): with a route its answer in
  // the Brief, the assistant's home; with none on the search's page.
  const ask = (question: string) => {
    done();
    void useAsk.getState().ask(question);
    if (routed) wantScreen("brief");
    else pickView("search");
  };

  const pickAirport = (r: AirportSearchRow) => {
    if (direct) {
      void flyDirect(r.ident);
      return;
    }
    setFocused(false);
    void pickPlace({ ident: r.ident, name: r.name, municipality: r.municipality });
  };
  // A waypoint or a navaid: its card, as a field's (selectPlace takes any
  // ident the planner knows), what was typed kept for the way back, as a
  // field's is (Apple Maps' card closed goes back to its search).
  const pickWaypoint = (ident: string) => {
    setFocused(false);
    selectPlace(ident);
  };

  // The top hit's quick actions (Apple Maps' buttons in a result, the
  // owner's screenshot, 2026-11-10): the airport card's Fly Here and Depart
  // From, the same handlers (useFlyHere, useRouteEdits), without opening
  // the card first; the search let go and the plan shown. None while the
  // field picks Home, a Favorite or where to fly Direct To.
  const actionable = !direct && picking === "place";
  const flyTo = (r: AirportSearchRow) => {
    done();
    void flyHere({ ident: r.ident });
    pickView("plan");
  };
  const departFromHit = (r: AirportSearchRow) => {
    done();
    departFrom({ ident: r.ident });
    pickView("plan");
  };
  // The top hit's actions that apply: Fly Here unless it is where the route
  // goes already, Depart From unless it is where it starts -- one, as a
  // single wide pill, where only one does (Apple's lone "Directions").
  const quick = (r: AirportSearchRow) =>
    [
      r.ident !== vm.planned.dest && { label: "Fly Here", run: () => flyTo(r), testId: "search-top-fly-here" },
      r.ident !== vm.planned.dep && { label: "Depart From", run: () => departFromHit(r), testId: "search-top-depart-from" },
    ].filter((a): a is { label: string; run: () => void; testId: string } => !!a);
  const flyAirplane = (hit: AirplaneHit) => {
    if (!hit.fly) return;
    done();
    hit.fly();
    if (routed) pickView("plan");
  };

  // Focused: the search's own page up, a card over it put away, all the
  // way up unless an Add asked quietly (useSearchPanel's quietFocus).
  const focus = () => {
    setFocused(true);
    if (place) selectPlace(null);
    listAway("favorites");
    pickView("search");
    if (!vm.quietFocus.current) setPanel("full");
  };
  // Cancel: the field let go, the plan back where there is a route.
  const cancel = () => {
    done();
    setPicking("place");
    if (place) selectPlace(null);
    if (routed) pickView("plan");
  };

  // ⌘K, `/`, the Map menu's row and D ask for the field (lib/oneSearch):
  // focused within the ask, so the keyboard comes up.
  const input = vm.searchInput;
  useEffect(
    () =>
      useSearchAsk.subscribe(({ ask }) => {
        if (!ask) return;
        takeSearchAsk();
        setDirect(ask.mode === "direct");
        setProblem(null);
        input.current?.focus();
      }),
    [input],
  );

  const placeholder = direct
    ? "Direct to which airport?"
    : picking === "home"
      ? "Search for your home airport"
      : picking === "favorite"
        ? "Search for an airport to keep"
        : "Search airports, airplanes, or ask";

  return {
    typed,
    direct,
    problem,
    focused,
    /** A search sent, its list shown while the field is let go. */
    sent: !!sent && !focused,
    send,
    placeholder,
    answered: search.answered,
    airports,
    waypoints,
    airplanes,
    does,
    setTyped: (text: string) => {
      // Typed over, a search sent is let go: the suggestions again.
      if (sent && text !== sent.query) useSearchResults.getState().clear();
      setQuery(text);
      setProblem(null);
      if (text && vm.view !== "search") pickView("search");
      if (text && vm.panel === "peek") setPanel("full");
    },
    pickAirport,
    pickWaypoint,
    actionable,
    quick,
    flyAirplane,
    focus,
    cancel,
  };
}

export type OneSearchModel = ReturnType<typeof useOneSearch>;
