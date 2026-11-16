import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { aircraftKey, choiceOf, tailTyped } from "../../../lib/aircraftChoice";
import { openAirplaneProfile } from "../../../lib/airplane/profileStore";
import { useAirplaneHits } from "./useAirplaneHits";
import { useHeardHits } from "./useHeardHits";
import type { TrafficAircraft } from "../../../lib/api/types";
import { registeredQuery } from "../../../lib/airplane/lookup";
import { usePreferences, type KeptAircraft } from "../../../lib/preferences";
import { queryClient } from "../../../lib/queryClient";
import { keptOf, keptPlane } from "../lib/keptAircraft";
import { useRadioActions } from "../../../lib/atcRadio";
import { SCREENS, type ScreenId } from "../../../lib/navigation/generated/screens";
import { wantScreen } from "../../../lib/navigation/wanted";
import { takeSearchAsk, useSearchAsk, useSearchPick } from "../../../lib/oneSearch";
import { usePickScope } from "./usePickScope";
import { positionIdent } from "../../../lib/identSchema";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { searchWords } from "../lib/searchPlaceholder";
import type { AirportSearchRow } from "../../../lib/useAirportSearch";
import { SCREEN_KEYS, DIRECT_KEY } from "../../../hooks/use-shortcuts";
import { useAirportIndex } from "../../../lib/airportIndex";
import { readQuery } from "../lib/searchFilters";
import { useEngineReady } from "../../../lib/engine/useEngineReady";
import { nearOf, useSearchResults } from "./useSearchResults";
import { riseToSee } from "./panelNow";
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
  /** Whether it is in the air, said in place as the live find answers (lib/airplane/lookup). */
  live?: { text: string; problem: boolean };
  /** In the air: its flight's card, tracked (FlightCard). */
  track?: () => void;
}

/** One thing to do: an action, a screen, or the words typed sent as a search round a place (Apple Maps' "Search
 *  Nearby" suggestion, the owner's screenshot, 2026-11-10). */
export interface DoHit {
  key: string;
  label: string;
  keys?: string;
  kind: "action" | "screen" | "nearby";
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

/** Where the airplane is now, as a route's point, read at the tap. */
const positionNow = () => {
  const fix = useOwnShip.getState().fix;
  return fix ? positionIdent(fix) : null;
};

/**
 * The one search's view model (the one-search design, 2026-11-09) over the
 * planner's: what is typed (the planner's query, so Home, a Favorite and a
 * picker's airport ask through the same field) and its results: Airports,
 * Waypoints and navaids, Airplanes, and Do (Direct To, the screens by name,
 * "Ask:"). Each pick opens a card, a profile or a screen that works the
 * figures out. Direct To, and a picker (usePickScope), take the next pick.
 */
export function useOneSearch(vm: PlanWorkspaceModel) {
  const { pickView, setPanel } = vm.view;
  const { routed, departFrom } = vm.route;
  const { changeAircraft } = vm.plan;
  const { place, selectPlace, selectFlight, listAway } = vm.cards;
  const { flyHere } = vm.map;
  const { query, setQuery, search, pickPlace, picking, setPicking, pickAirplane } = vm.search;
  const typed = query.trim();
  // Asked for an airplane to keep (an Add of the pilot's Airplane or a
  // Favorite): airplanes alone, the one picked kept rather than opened.
  const airplaneAsk = picking === "mine" || picking === "airplane";
  // A search sent (useSearchResults): its list in the sheet while the
  // field is not being typed in, its fields on the map.
  const sent = useSearchResults((s) => s.sent);
  const index = useAirportIndex(true, typed.length > 0);
  const [direct, setDirect] = useState(false);
  // A picker's ask: airports only (the waypoints too for a stop), its pick.
  const { pick, from: pickFrom } = usePickScope(vm.view.view); // pickIdent: its airport, picked or typed
  const [problem, setProblem] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const directTo = useRadioActions((s) => s.directTo);

  // An N-number is the engine's to tell (tailTyped): none until it is there.
  const engine = useEngineReady();
  const tail = direct || !engine ? null : tailTyped(typed);
  // The airplanes found, from the one source the FPL's airplane field shares (useAirplaneHits):
  // the pilot's own open their profile and fly from the top hit, the kept their flight, the
  // registry's its profile with whether it is in the air, a type the pilot's airplanes.
  const hits = useAirplaneHits({ typed, tail, live: true, enabled: !direct && !pick });
  // And those the map hears by their callsign or address (useHeardHits), each once.
  const known = new Set([...hits.kept.map((k) => k.kept.hex), hits.registry?.lookup.hex]);
  const heard = useHeardHits(typed, !direct && !pick).filter((h) => !known.has(h.plane.hex));
  // Kept as asked, else opened: the one rule (useSearchPanel's pickAirplane).
  const keep = (kept: KeptAircraft, open: (hex: string) => void) => {
    pickAirplane(kept, open);
    if (airplaneAsk) done();
  };
  // One named by its N-number asked for to keep -- the pilot's own, the
  // registry's -- by the address on the FAA's record (asked already, so at once).
  const keepTail = async (tail: string) => {
    const record = await queryClient.fetchQuery(registeredQuery(tail)).catch(() => null);
    if (record?.mode_s_hex) keep(keptOf({ ...record, mode_s_hex: record.mode_s_hex }), () => {});
    else setProblem(`The FAA's registry gives no address for ${tail}, so it can't be kept.`);
  };
  const airplanes: AirplaneHit[] = [
    ...hits.own.map(({ record: r, ...row }) => ({
      ...row,
      pick: () => (airplaneAsk ? void keepTail(r.tailNumber) : openAirplaneProfile(r.tailNumber)),
      fly: airplaneAsk ? undefined : () => changeAircraft(aircraftKey(choiceOf(r, hits.profiles ?? []))),
    })),
    ...hits.kept.map(({ kept: a, ...row }) => ({ ...row, pick: () => keep(a, selectFlight) })),
    ...(hits.registry ? [registryHit(hits.registry, selectFlight, airplaneAsk ? keepTail : null)] : []),
    ...heard.map(({ plane, ...row }) => ({ ...row, pick: () => keep(keptPlane(plane), () => selectFlight(plane.hex, plane)) })),
    ...(airplaneAsk ? [] : hits.types.map(({ profile: _, ...row }) => ({ ...row, pick: () => wantScreen("airplanes") }))),
  ];

  const airports = useMemo(() => (airplaneAsk ? [] : search.rows.filter((r) => r.kind !== "fix")), [airplaneAsk, search.rows]);
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
  const does: DoHit[] = [];
  // The departure asked for: where the airplane is, first, as Maps' From
  // offers My Location -- a route may start at a present position, as Fly
  // Here's does (the owner's "Departure → HSKEL → KJAX", 2026-11-13).
  if (pick?.label === "Departure" && positioned && (!typed || finds(typed, "My Position")))
    does.push({ key: "my-position", label: "My Position", kind: "action", run: () => pickIdent(positionNow() ?? "") });
  const trafficOn = usePreferences((p) => p.traffic);
  if (!direct && !pick && !airplaneAsk) {
    const out = does;
    const first = airports[0];
    // Direct To the first airport found, where the radio can fly one.
    if (first && directTo)
      out.push({ key: "direct-first", label: `Direct to ${first.ident}`, kind: "action", run: () => void flyDirect(first.ident) });
    const actions: DoHit[] = [
      { key: "direct", label: "Direct To…", keys: DIRECT_KEY, kind: "action", run: () => (setDirect(true), setQuery("")) },
      // The traffic on the map, where its page was (2026-11-14): the airplanes
      // heard are found by this search, and a tap on one opens its card.
      { key: "traffic", label: "Show Traffic", kind: "action", run: () => (done(), usePreferences.getState().setTraffic(true)) },
    ];
    for (const a of actions)
      if (!typed || finds(typed, a.label)) if ((a.key !== "direct" || directTo) && (a.key !== "traffic" || !trafficOn)) out.push(a);
    for (const id of OFFERED) {
      const title = SCREENS[id].title;
      if (typed && !finds(typed, title)) continue;
      if (!typed && !SCREEN_KEYS[id] && id !== "emergency") continue;
      out.push({ key: `screen-${id}`, label: title, keys: SCREEN_KEYS[id], kind: "screen", run: () => (done(), wantScreen(id)) });
    }
    // The words typed sent as a search round a place, Apple's "Search Nearby" row, first.
    if (typed) out.push({ key: "nearby", label: typed, kind: "nearby", run: () => send(typed) });
  }

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

  const pickIdent = (ident: string) => {
    if (!ident) return; // My Position with the fix gone since
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

  // ⌘K, `/`, the Map menu's row and D ask for the field (lib/oneSearch):
  // focused within the ask, so the keyboard comes up.
  const input = vm.search.searchInput;
  useEffect(
    () =>
      useSearchAsk.subscribe(({ ask }) => {
        if (!ask) return;
        takeSearchAsk();
        setDirect(ask.mode === "direct");
        setProblem(null);
        // A picker's ask on the Search page, where its field and rows are:
        // asked from FPL (the route box's Departure), it focused a field on
        // the page not up, and nothing seemed to happen (2026-11-13). Any
        // ask while that page is put away likewise. The page drawn up before
        // the focus: put away it is inert (SheetPage), and an inert field
        // takes no focus, so the route box's stop asked for none came.
        if (ask.mode === "pick" || input.current?.closest("[inert]")) flushSync(() => pickView("search"));
        input.current?.focus();
      }),
    [input, pickView],
  );

  return {
    typed,
    direct,
    pick,
    pickIdent,
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

/** The registry's row in the one search: its profile, whether it is in the air under it, and
 *  Track where it is. */
function registryHit(
  row: NonNullable<ReturnType<typeof useAirplaneHits>["registry"]>,
  selectFlight: (hex: string, plane?: TrafficAircraft) => void,
  /** Asked for one to keep: kept by its N-number, not opened. */
  keep: ((tail: string) => Promise<void>) | null,
): AirplaneHit {
  const { key, title, detail, lookup } = row;
  const { inAir } = lookup;
  return {
    key,
    title,
    detail,
    live: lookup.inAirWords,
    pick: () => (keep ? void keep(title) : openAirplaneProfile(title)),
    track: !keep && inAir.state === "flying" ? () => selectFlight(inAir.plane.hex, inAir.plane) : undefined,
  };
}
