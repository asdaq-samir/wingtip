import { useMemo, useState } from "react";
import { tailTyped } from "../../../lib/aircraftChoice";
import { riseToSee } from "../../plan";
import { usePreferences } from "../../../lib/preferences";
import { useRadioActions } from "../../../lib/atcRadio";
import { pickInUse, useSearchPick } from "../../../lib/oneSearch";
import { usePickScope } from "./usePickScope";
import { pickRefusal } from "../../../lib/pickRefusal";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { searchWords } from "./searchPlaceholder";
import type { AirportSearchRow } from "../../../lib/airportIndex";
import { useAirportIndex } from "../../../lib/airportIndex";
import { readQuery, nearOf, useSearchResults } from "../../search";
import { useEngineReady } from "../../../lib/engine/useEngineReady";
import type { PlanSlices } from "../vm/planSlices";
import { useSearchAirplanes, type AirplaneHit } from "./searchAirplanes";
import { doHits } from "./searchDoes";
import { useSearchAskFocus } from "./useSearchAskFocus";
import { usePrefetchHighlighted } from "./usePrefetchHighlighted";
import { useSearchQuery } from "./searchQuery";
import { useAirportSearch } from "../../../lib/useAirportSearch";

/**
 * The one search's view model (the one-search design, 2026-11-09) over the
 * planner's: what is typed (searchQuery, so Home, a Favorite and a
 * picker's airport ask through the same field) and its results: Airports,
 * Waypoints and navaids, Airplanes, and Do (Direct To, the screens by name,
 * "Ask:"). Each pick opens a card, a profile or a screen that works the
 * figures out. Direct To, and a picker (usePickScope), take the next pick.
 */
export function useOneSearch(vm: PlanSlices<"cards" | "map" | "plan" | "route" | "search" | "view">) {
  const { pickView, setPanel } = vm.view;
  const { routed, departFrom } = vm.route;
  const { changeAircraft } = vm.plan;
  const { place, selectPlace, selectFlight, listAway } = vm.cards;
  const { flyHere } = vm.map;
  const { pickPlace, picking, setPicking, pickAirplane } = vm.search;
  const query = useSearchQuery((s) => s.query);
  const setQuery = useSearchQuery((s) => s.setQuery);
  const typed = query.trim();
  // Its airports and, with them, the waypoints and navaids (its Waypoints
  // and Navaids group), asked while it is the place up.
  const search = useAirportSearch(query, vm.view.view === "search", true);
  // Asked for an airplane to keep (an Add of the pilot's Airplane or a
  // Favorite): airplanes alone, the one picked kept rather than opened.
  const airplaneAsk = picking === "mine" || picking === "airplane";
  // A search sent (useSearchResults): its list in the sheet while the
  // field is not being typed in, its fields on the map.
  const sent = useSearchResults((s) => s.sent);
  const [direct, setDirect] = useState(false);
  // A picker's ask: airports only (the waypoints too for a stop), its pick.
  const { pick: asked, from: pickFrom } = usePickScope(vm.view.view); // pickIdent: its airport, picked or typed
  const [focused, setFocused] = useState(false);
  // A waiting ask (the first flight's) takes no tap until the field is used.
  const pick = pickInUse(asked, focused || typed.length > 0);
  // Read while a picker asks too, for the closed fields it refuses (pickIdent).
  const index = useAirportIndex(true, typed.length > 0 || !!pick);
  const [problem, setProblem] = useState<string | null>(null);
  const directTo = useRadioActions((s) => s.directTo);

  // An N-number is the engine's to tell (tailTyped): none until it is there.
  const engine = useEngineReady();
  const tail = direct || !engine ? null : tailTyped(typed);
  const airplanes = useSearchAirplanes({
    typed,
    tail,
    // Not while a picker asks for an airport (Add a Stop, Change), but
    // while the first flight's destination waits for one (`waiting`): an
    // N-number typed there found nothing (the owner's iPhone, 2026-11-26,
    // N606FR from the main sheet with no route), and an airplane is never
    // the destination it asks for.
    enabled: !direct && (!pick || !!pick.waiting),
    airplaneAsk,
    pickAirplane,
    changeAircraft,
    selectFlight,
    setProblem,
    done: () => done(),
  });

  const airports = useMemo(() => (airplaneAsk ? [] : search.rows.filter((r) => r.kind !== "fix")), [airplaneAsk, search.rows]);
  const airportIdents = useMemo(() => airports.map((r) => r.ident), [airports]);
  // The lit row's card asked ahead of its pick (the Autocomplete's onItemHighlighted).
  const highlighted = usePrefetchHighlighted(airportIdents);
  const noFixes = direct || airplaneAsk || (!!pick && !pick.fixes);
  const waypoints = useMemo(() => (noFixes ? [] : search.rows.filter((r) => r.kind === "fix")), [noFixes, search.rows]);

  // Done: what is typed let go, Direct To and a picker's ask put away.
  const done = () => {
    useSearchResults.getState().clear();
    setQuery("");
    setDirect(false);
    useSearchPick.setState({ pick: null });
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

  // Whether a position is known, for a departure asked for (useStopAsked); the fix read at the tap:
  // the whole fix drew the workspace again at every GPS fix (PERF-1).
  const positioned = useOwnShip((s) => s.enabled && s.fix !== null);
  const trafficOn = usePreferences((p) => p.traffic);

  // Sent: round the place it names, else own ship or Nearest's place, else
  // the departure (nearOf); the field let go, what was typed kept in it.
  const send = (text: string) => {
    const near = nearOf(
      text,
      index,
      vm.map.nearOrigin ? { label: vm.cards.nearFrom?.label ?? "your position", ...vm.map.nearOrigin } : null,
      vm.route.planned.dep,
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
    riseToSee(setPanel);
  };

  // Why this airport cannot be picked now (Closed; On the route already), for the rows to grey.
  const refusal = (ident: string) => pickRefusal(pick, index, ident);
  const pickIdent = (ident: string) => {
    if (!ident || refusal(ident)) return; // My Location with the fix gone since; a field refused
    const to = pick;
    done();
    to?.onPick(ident.toUpperCase());
    pickView(pickFrom.current);
  };
  const pickAirport = (r: AirportSearchRow) => {
    if (pick) return pickIdent(r.ident);
    if (direct) {
      void flyDirect(r.ident);
      return;
    }
    setFocused(false);
    void pickPlace({ ident: r.ident, name: r.name, municipality: r.municipality });
  };
  // A waypoint or a navaid: its card (selectPlace takes any ident), what was
  // typed kept for the way back, as Apple Maps' card closed goes to its search.
  const pickWaypoint = (ident: string) => {
    if (pick) return pickIdent(ident);
    setFocused(false);
    selectPlace(ident);
  };

  // The top hit's quick actions (Apple Maps', 2026-11-10): the card's Fly Here and Depart From
  // (useFlyHere, useRouteEdits), no card first; none while the field picks something.
  const actionable = !direct && !pick && picking === "place";
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
  // Those that apply: Fly Here unless it is the destination, Depart From unless the departure --
  // one, a single wide pill, where only one does (Apple's "Directions"); none for a closed field (0043).
  const quick = (r: AirportSearchRow) =>
    [
      r.ident !== vm.route.planned.dest && !r.closed && { label: "Fly Here", run: () => flyTo(r), testId: "search-top-fly-here" },
      r.ident !== vm.route.planned.dep &&
        !r.closed && { label: "Depart From", run: () => departFromHit(r), testId: "search-top-depart-from" },
    ].filter((a): a is { label: string; run: () => void; testId: string } => !!a);
  const flyAirplane = (hit: AirplaneHit) => {
    if (!hit.fly) return;
    done();
    hit.fly();
    if (routed) pickView("plan");
  };

  // Focused: the search's own page up, a card over it put away; the sheet
  // stays where the pilot put it, the keyboard placed over it by the
  // Drawer's VirtualKeyboardProvider (the owner, 2026-11-11: "Whenever I
  // try to type on search bar it takes the card to full screen").
  const focus = () => {
    setFocused(true);
    if (place) selectPlace(null);
    listAway("favorites");
    pickView("search");
  };
  // Cancel: let go, back where a picker asked from, else the plan with a route.
  const cancel = () => {
    done();
    setPicking("place");
    if (place) selectPlace(null);
    if (pick) pickView(pickFrom.current);
    else if (routed) pickView("plan");
  };

  // ⌘K, `/`, the Map menu's row and D ask for the field (lib/oneSearch).
  useSearchAskFocus({ input: vm.search.searchInput, pickView, setQuery, setDirect, setProblem });
  const does = doHits({
    typed,
    direct,
    pick,
    airplaneAsk,
    positioned,
    trafficOn,
    airports,
    canDirect: !!directTo,
    pickIdent,
    flyDirect,
    startDirect: () => (setDirect(true), setQuery("")),
    done,
    send,
  });

  return {
    typed,
    direct,
    pick,
    pickIdent,
    refusal,
    // Its own, else why a picker's last pick would not do (the first flight's).
    problem: problem ?? pick?.problem ?? null,
    focused,
    /** A search sent, its list shown while the field is let go. */
    sent: !!sent && !focused,
    send,
    // The field's words, shown short and said whole.
    ...searchWords(direct, pick, picking),
    answered: search.answered,
    airports,
    waypoints,
    airplanes,
    does,
    highlighted,
    setTyped: (text: string) => {
      // Typed over, a search sent is let go: the suggestions again.
      if (sent && text !== sent.query) useSearchResults.getState().clear();
      setQuery(text);
      setProblem(null);
      if (text && vm.view.view !== "search") pickView("search");
    },
    pickAirport,
    pickWaypoint,
    actionable,
    quick,
    flyAirplane,
    focus,
    cancel,
    letGo: done, // A card's Fly Here or Add Stop: the route set, the search let go with it, as the top hit's are.
  };
}

export type OneSearchModel = ReturnType<typeof useOneSearch>;
