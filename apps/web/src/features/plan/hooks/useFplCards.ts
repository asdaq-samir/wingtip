import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SetURLSearchParams } from "react-router";
import type { PanelState } from "../../../lib/mapChrome";
import { useRadioActions } from "../../../lib/atcRadio";
import { lessonOf } from "../../../lib/lessonLink";
import { usePreferences } from "../../../lib/preferences";
import { sameField } from "../../../lib/procedures";
import { stopsAlongQuery, stopsNearQuery } from "../../../lib/queryClient";
import { kindsOf, type StopKind } from "../../../lib/stopKinds";
import { useStopsAlong } from "../lib/stopsAlong";
import { setCard, useSheetCards } from "../../../lib/sheetCards";
import { patched } from "../../../lib/useSearchParamsNow";
import type { ProceduresAt } from "../components/ProceduresRoute";
import { riseToSee } from "./panelNow";
import type { PlannedRoute } from "./planAddress";
import type { PanelView } from "./usePanelView";
import { useOpenScreen } from "./useOpenScreen";

/** The Stops card's id among the cards (CardLayer), for its pins' taps. */
export const STOPS_CARD = "stops";

/**
 * The cards over FPL and the lists in full (usePlanWorkspace): the Brief,
 * the Nav Log, the Profile and the map's Stops, each a card sizing its own
 * drawer (CardStack; the owner, 2026-11-11: pages are cards), opening by
 * the card rule; Saved, Nearest and an instructor's lesson. A list opened
 * from the pill raises the sheet to half so it is seen, and nothing else
 * sizes the sheet: it keeps the size the pilot left it at, opening or
 * closing (riseToSee; the owner, 2026-11-11). With the Stops' own
 * questions and pins, and the microphone's commands that open them.
 */
export function useFplCards({
  view,
  routed,
  local,
  planned,
  fix,
  fuelStopPins,
  briefOpen,
  setViewPick,
  setPanel,
  searchParams,
  setSearchParams,
  setProceduresShown,
}: {
  view: PanelView;
  /** A route on screen, planned or local. */
  routed: boolean;
  /** A local flight (usePlan's `local`). */
  local: boolean;
  planned: PlannedRoute;
  /** Own ship, where it is near enough to look round (useOwnShipNear). */
  fix: { lat: number; lon: number } | null;
  /** The suggested fuel stops' pins, which keep their own (useSuggestedStops). */
  fuelStopPins: { ident: string }[];
  /** FPL's Brief in the address (`brief=1`). */
  briefOpen: boolean;
  setViewPick: (view: PanelView) => void;
  setPanel: (state: PanelState) => void;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  setProceduresShown: (at: ProceduresAt) => void;
}) {
  // The Nav Log's card, from the route's menu, where FPL shows the route in
  // order (NavLogView's `route`).
  const [navLogOpen, setNavLogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // The Brief in sight: FPL's, over a route.
  const briefShown = briefOpen && view === "plan" && routed;
  // The Nav Log, a card over FPL as the Brief is (PlanPage).
  const navLogShown = navLogOpen && view === "plan" && routed && !briefShown;
  // The side view, a card over FPL as the nav log is (ProfileCard).
  const profileShown = profileOpen && view === "plan" && routed && !briefShown && !navLogShown;
  // The map's Stops (StopsCard), a card over FPL as the Profile is, opened
  // from the Airport tab's Find Nearby (its button among the map's gave its
  // place to the radio's microphone, 2026-11-02).
  const stopsOpen = useStopsAlong((st) => st.open);
  const setStopsOpen = useStopsAlong((st) => st.setOpen);
  // The page the Stops were opened from, which their close goes back to
  // (docs/design/rules.md, card rule 1: ✕ goes back): Search's Find Nearby
  // keeps Search under them, where they took the sheet to FPL and left it there.
  const [stopsFrom, setStopsFrom] = useState<PanelView>("plan");
  // With a route or none: with none, the stops are round the pilot.
  const stopsShown = stopsOpen && (view === "plan" || view === stopsFrom) && !briefShown && !navLogShown && !profileShown;
  // The same whatever the tab: what FPL keeps under the others (TabKept).
  const briefHere = briefOpen && routed;
  // Where the Stops are looked for: along the course while one is drawn
  // (the owner, 2026-10-26), else round own ship (StopsCard).
  const stopsRoute = useMemo(
    () => (routed && !local && planned.dest ? { dep: planned.dep, dest: `${planned.dest}`, stops: planned.stops.join(",") } : null),
    [routed, local, planned.dep, planned.dest, planned.stops],
  );
  const stopsAt = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon } : null), [fix]);
  const stopsRadius = usePreferences((p) => p.stopsRadiusNm);
  const stopKind = usePreferences((p) => p.stopKind);
  // Along the route or round the pilot, as the sheet's pull-down picks
  // (StopsCard): along it where there is one, until the pilot says.
  const stopsScopePicked = useStopsAlong((st) => st.scope);
  const setStopsScope = useStopsAlong((st) => st.setScope);
  const stopsScope = stopsRoute ? (stopsScopePicked ?? "route") : "near";
  // Asked for as soon as there is a route (or a position), not at the
  // button's tap: the planner reads each field's places and outline from
  // Overture the first time, half a minute for a long route's forty, and
  // the owner waited on it ("why is it taking a long time to see these
  // fly in airports", 2026-10-26). Not for each Routes card swiped past.
  // Pinned only while the sheet is open (the same queries as the sheet's).
  const { data: stopsNear } = useQuery({
    ...stopsNearQuery(stopsAt?.lat ?? 0, stopsAt?.lon ?? 0, stopsRadius),
    enabled: !!stopsAt && (!stopsRoute || stopsScope === "near"),
  });
  const { data: stopsAlong } = useQuery({
    ...stopsAlongQuery(stopsRoute?.dep ?? "", stopsRoute?.dest ?? "", stopsRoute?.stops ?? ""),
    enabled: !!stopsRoute,
  });
  const stopsFound = stopsScope === "route" ? stopsAlong : stopsNear;
  // Each field's stacked pins, the kind picked alone where one is (the
  // owner's "With a kind picked, that kind's pin only"). A suggested fuel
  // stop keeps its own pin, not stacked over (the owner's "when food is
  // shown, don't hide the fuel", 2026-10-26).
  const stopFieldPins = useMemo(
    () =>
      stopsShown && stopsFound
        ? stopsFound.fields.flatMap((f) => {
            const kinds = kindsOf(f).filter((k) => stopKind === "all" || k === stopKind);
            return kinds.length && !fuelStopPins.some((p) => p.ident === f.ident)
              ? [{ ident: f.ident, lat: f.lat, lon: f.lon, kinds }]
              : [];
          })
        : undefined,
    [stopsShown, stopsFound, stopKind, fuelStopPins],
  );
  // FPL's saved flights in full, a card over it (SAVED's title).
  const savedOpen = searchParams.get("saved") === "1";
  // An approach set by their instructor, open over the map until closed.
  const lessonOpen = lessonOf(searchParams.get("lesson"));
  const closeLesson = useCallback(() => {
    setSearchParams((prev) => patched(prev, { lesson: null }), { replace: true });
  }, [setSearchParams]);
  // Each written in place of the address's last, as every panel change is
  // (lib/backNavigation): they pushed onto the history, the browser's Back stepping
  // through Saved and Nearest alone of the lists.
  const openSaved = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { saved: "1" });
      },
      { replace: true },
    );
    riseToSee(setPanel);
  }, [setSearchParams, setPanel]);
  // And back from it to FPL's start, its own Back (FlightsPanel's head).
  const closeSaved = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { saved: null });
      },
      { replace: true },
    );
  }, [setSearchParams]);
  // The Brief, from the chips' Brief: its own card, opened at the height
  // FPL is at, half from the pill and all the way up staying so (CardStack,
  // the owner's "Brief opens in half card when clicked on full fpl tab");
  // FPL under it stays as it was.
  const openBrief = useCallback(() => {
    setStopsOpen(false);
    setSearchParams(
      (prev) => {
        return patched(prev, { brief: "1" });
      },
      { replace: true },
    );
  }, [setSearchParams, setStopsOpen]);
  const closeBrief = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { brief: null });
      },
      { replace: true },
    );
  }, [setSearchParams]);
  // The Nav Log from the route's menu, a card over FPL as the Brief is,
  // opening by the card rule (CardStack), the sheet under it left as it is.
  const openNavLogCard = useCallback(() => {
    setStopsOpen(false);
    setNavLogOpen(true);
    setProfileOpen(false);
  }, [setStopsOpen]);
  const closeNavLogCard = useCallback(() => setNavLogOpen(false), []);
  // The side view the same way, from its button beside the nav log's, at
  // the owner's ask ("profile view can move next to the navlog button and
  // open like brief and navlog opens instead of the swipe").
  const openProfileCard = useCallback(() => {
    setStopsOpen(false);
    setProfileOpen(true);
    setNavLogOpen(false);
  }, [setStopsOpen]);
  const closeProfileCard = useCallback(() => setProfileOpen(false), []);
  // The map's Stops put away, the sheet where it is, on the page they were
  // opened from.
  const closeStops = useCallback(() => {
    setStopsOpen(false);
    if (stopsFrom !== view) setViewPick(stopsFrom);
  }, [setStopsOpen, stopsFrom, view, setViewPick]);
  // Opened: the other cards over FPL and an airport's put away; the card
  // opens by the card rule, as the Profile's, over the page it was asked
  // from (Search's Find Nearby, round the pilot), that page remembered for
  // its close.
  const openStops = useCallback(() => {
    setStopsOpen(true);
    setStopsFrom(view);
    setNavLogOpen(false);
    setProfileOpen(false);
    setSearchParams((prev) => (prev.get("brief") || prev.get("place") ? patched(prev, { brief: null, place: null }) : prev), {
      replace: true,
    });
  }, [setStopsOpen, setSearchParams, view]);
  // Find Nearby's tile (the Airport tab): the Stops round the pilot, that
  // kind picked.
  const setStopKind = usePreferences((p) => p.setStopKind);
  const findNearby = useCallback(
    (kind: StopKind) => {
      setStopKind(kind);
      setStopsScope("near");
      openStops();
    },
    [setStopKind, setStopsScope, openStops],
  );
  // Put away with the planner.
  useEffect(() => () => setStopsOpen(false), [setStopsOpen]);
  // A field's pin tapped on the chart: its row picked in the Stops card,
  // the card half way up from its pill so the row is in sight (its own
  // drawer's snap point, as useCardSize sets it), where the tap opened the
  // field's card (the owner, 2026-10-28: the card is a tap on the row's
  // ident away).
  const setStopPicked = useStopsAlong((st) => st.setPicked);
  const pickStopField = useCallback(
    (ident: string) => {
      setStopPicked(ident);
      const stops = useSheetCards.getState().stack.find((entry) => entry.id === STOPS_CARD);
      if (stops?.at === "peek") setCard(STOPS_CARD, { at: "half" });
    },
    [setStopPicked],
  );
  // The legs asked for from the Brief: FPL in its place, the sheet at the
  // size the pilot left it (half from the pill).
  const showLegs = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { brief: null });
      },
      { replace: true },
    );
    riseToSee(setPanel);
  }, [setSearchParams, setPanel]);
  // The strip's title opens the list in full, over Airport: its card all
  // the way up (NearestCard's `opens`).
  const openNearest = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { near: "1" });
      },
      { replace: true },
    );
  }, [setSearchParams]);
  // And its Back, to Airport's start: the list and the place it was from
  // put away.
  const closeNearest = useCallback(() => {
    setSearchParams(
      (prev) => {
        return patched(prev, { near: null, nearAt: null, nearName: null });
      },
      { replace: true },
    );
  }, [setSearchParams]);
  // The microphone's own commands (components/pilotCommand, RadioLayer): the
  // Nearest list over Airport, and an approach's page in the procedures
  // sheet, whose lists are the route's fields' alone.
  const plannedStops = planned.stops;
  useEffect(() => {
    useRadioActions.setState({
      nearest: () => {
        setViewPick("search");
        openNearest();
      },
      showProcedure: async (ident, approach, runway) => {
        if (![planned.dep, ...plannedStops, planned.dest].some((f) => f && sameField(f, ident)))
          return `${ident} is not on the route: add it first.`;
        setProceduresShown({ ident, kind: "approach", pick: { approach, runway } });
        return null;
      },
    });
    return () => useRadioActions.setState({ nearest: null, showProcedure: null });
  }, [setViewPick, openNearest, planned.dep, plannedStops, planned.dest, setProceduresShown]);
  // A screen asked for by name, by a link or from inside the app.
  useOpenScreen({ routed, searchParams, setSearchParams, setViewPick, setPanel, openBrief, openNavLogCard, openProfileCard, openNearest });
  return {
    briefShown,
    navLogShown,
    profileShown,
    stopsShown,
    briefHere,
    stopsRoute,
    stopsAt,
    stopsScope,
    setStopsScope,
    stopFieldPins,
    savedOpen,
    lessonOpen,
    closeLesson,
    openSaved,
    closeSaved,
    openBrief,
    closeBrief,
    openNavLogCard,
    closeNavLogCard,
    openProfileCard,
    closeProfileCard,
    closeStops,
    findNearby,
    pickStopField,
    showLegs,
    openNearest,
    closeNearest,
  };
}
