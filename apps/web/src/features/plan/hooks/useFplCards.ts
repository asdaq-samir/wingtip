import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SetURLSearchParams } from "react-router-dom";
import type { PanelState } from "../../../components/mapChrome";
import { useRadioActions } from "../../../lib/atcRadio";
import { lessonOf } from "../../../lib/lessonLink";
import { usePreferences } from "../../../lib/preferences";
import { sameField } from "../../../lib/procedures";
import { stopsAlongQuery, stopsNearQuery } from "../../../lib/queryClient";
import { kindsOf, type StopKind } from "../../../lib/stopKinds";
import { useStopsAlong } from "../lib/stopsAlong";
import { patched } from "../../../lib/useSearchParamsNow";
import type { ProceduresAt } from "../components/ProceduresRoute";
import { panelNow } from "./panelNow";
import type { PlannedRoute } from "./planAddress";
import type { PanelTab } from "./useTabCards";

/**
 * The cards over FPL and the lists in full (usePlanWorkspace): the Brief,
 * the nav log, the side view and the map's Stops, each opened at the
 * height FPL is at and put away to the height it had (closeCard); Saved,
 * Nearest and an instructor's lesson. With the Stops' own questions and
 * pins, and the microphone's commands that open them.
 */
export function useFplCards({
  tab, routed, local, planned, fix, fuelStopPins, briefOpen, closeCard, setTabPick, setPanel, searchParams, setSearchParams, setProceduresShown,
}: {
  tab: PanelTab;
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
  closeCard: (close: () => void) => void;
  setTabPick: (tab: PanelTab) => void;
  setPanel: (state: PanelState) => void;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  setProceduresShown: (at: ProceduresAt) => void;
}) {
  // The nav log's own sheet, from the route's box's Nav log button, where
  // FPL shows the route in order (NavLogView's `route`).
  const [navLogOpen, setNavLogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // The Brief in sight: FPL's, over a route.
  const briefShown = briefOpen && tab === "fpl" && routed;
  // The nav log, a card over FPL as the Brief is (NavLogView's cardHead).
  const navLogShown = navLogOpen && tab === "fpl" && routed && !briefShown;
  // The side view, a card over FPL as the nav log is (ProfileCard).
  const profileShown = profileOpen && tab === "fpl" && routed && !briefShown && !navLogShown;
  // The map's Stops (StopsCard), a card over FPL as the Profile is, opened
  // from the Airport tab's Find Nearby (its button among the map's gave its
  // place to the radio's microphone, 2026-11-02).
  const stopsOpen = useStopsAlong(st => st.open);
  const setStopsOpen = useStopsAlong(st => st.setOpen);
  // With a route or none: with none, the stops are round the pilot.
  const stopsShown = stopsOpen && tab === "fpl" && !briefShown && !navLogShown && !profileShown;
  // The same whatever the tab: what FPL keeps under the others (TabKept).
  const briefHere = briefOpen && routed;
  const profileHere = profileOpen && routed && !briefHere && !(navLogOpen && routed);
  const stopsHere = stopsOpen && !briefHere && !(navLogOpen && routed) && !profileHere;
  // Where the Stops are looked for: along the course while one is drawn
  // (the owner, 2026-10-26), else round own ship (StopsCard).
  const stopsRoute = useMemo(() => (routed && !local && planned.dest
    ? { dep: planned.dep, dest: `${planned.dest}`, stops: planned.stops.join(",") } : null),
  [routed, local, planned.dep, planned.dest, planned.stops]);
  const stopsAt = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon } : null), [fix]);
  const stopsRadius = usePreferences(p => p.stopsRadiusNm);
  const stopKind = usePreferences(p => p.stopKind);
  // Along the route or round the pilot, as the sheet's pull-down picks
  // (StopsCard): along it where there is one, until the pilot says.
  const stopsScopePicked = useStopsAlong(st => st.scope);
  const setStopsScope = useStopsAlong(st => st.setScope);
  const stopsScope = stopsRoute ? stopsScopePicked ?? "route" : "near";
  // Asked for as soon as there is a route (or a position), not at the
  // button's tap: the planner reads each field's places and outline from
  // Overture the first time, half a minute for a long route's forty, and
  // the owner waited on it ("why is it taking a long time to see these
  // fly in airports", 2026-10-26). Not for each Routes card swiped past.
  // Pinned only while the sheet is open (the same queries as the sheet's).
  const { data: stopsNear } = useQuery({ ...stopsNearQuery(stopsAt?.lat ?? 0, stopsAt?.lon ?? 0, stopsRadius), enabled: !!stopsAt && (!stopsRoute || stopsScope === "near") });
  const { data: stopsAlong } = useQuery({ ...stopsAlongQuery(stopsRoute?.dep ?? "", stopsRoute?.dest ?? "", stopsRoute?.stops ?? ""), enabled: !!stopsRoute });
  const stopsFound = stopsScope === "route" ? stopsAlong : stopsNear;
  // Each field's stacked pins, the kind picked alone where one is (the
  // owner's "With a kind picked, that kind's pin only"). A suggested fuel
  // stop keeps its own pin, not stacked over (the owner's "when food is
  // shown, don't hide the fuel", 2026-10-26).
  const stopFieldPins = useMemo(() => (stopsShown && stopsFound ? stopsFound.fields.flatMap(f => {
    const kinds = kindsOf(f).filter(k => stopKind === "all" || k === stopKind);
    return kinds.length && !fuelStopPins.some(p => p.ident === f.ident) ? [{ ident: f.ident, lat: f.lat, lon: f.lon, kinds }] : [];
  }) : undefined), [stopsShown, stopsFound, stopKind, fuelStopPins]);
  // FPL's saved flights in full, a card over it (SAVED's title).
  const savedOpen = searchParams.get("saved") === "1";
  // An approach set by their instructor, open over the map until closed.
  const lessonOpen = lessonOf(searchParams.get("lesson"));
  const closeLesson = useCallback(() => {
    setSearchParams(prev => patched(prev, { lesson: null }), { replace: true });
  }, [setSearchParams]);
  // Each written in place of the address's last, as every panel change is
  // (lib/backNavigation): they pushed onto the history, the browser's Back stepping
  // through Saved and Nearest alone of the lists.
  const openSaved = useCallback(() => {
    setSearchParams(prev => {
      return patched(prev, { saved: "1" });
    }, { replace: true });
    setPanel("full");
  }, [setSearchParams, setPanel]);
  // And back from it to FPL's start, its own Back (FlightsPanel's head).
  const closeSaved = useCallback(() => {
    setSearchParams(prev => {
      return patched(prev, { saved: null });
    }, { replace: true });
  }, [setSearchParams]);
  // The Brief, from the chips' Brief: half way, as an airport's card opens
  // from the route (selectPlace), or all the way up where FPL is, and put
  // away at the height FPL had before it (closeCard), as a card's close does.
  // At the height FPL is at, all the way up staying so, at the owner's ask
  // ("Brief opens in half card when clicked on full fpl tab").
  const openBrief = useCallback(() => {
    setStopsOpen(false);
    setSearchParams(prev => {
      return patched(prev, { brief: "1" });
    }, { replace: true });
    if (panelNow.current !== "full") setPanel("half");
  }, [setSearchParams, setPanel, setStopsOpen]);
  const closeBrief = useCallback(() => {
    closeCard(() => setSearchParams(prev => {
      return patched(prev, { brief: null });
    }, { replace: true }));
  }, [closeCard, setSearchParams]);
  // The nav log from the route box's button, a card over FPL as the Brief
  // is, at the height FPL is at (half from the pill), put away to the
  // height it had (closeCard).
  const openNavLogCard = useCallback(() => {
    setStopsOpen(false);
    setNavLogOpen(true);
    setProfileOpen(false);
    if (panelNow.current !== "full") setPanel("half");
  }, [setPanel, setStopsOpen]);
  const closeNavLogCard = useCallback(() => closeCard(() => setNavLogOpen(false)), [closeCard]);
  // The side view the same way, from its button beside the nav log's, at
  // the owner's ask ("profile view can move next to the navlog button and
  // open like brief and navlog opens instead of the swipe").
  const openProfileCard = useCallback(() => {
    setStopsOpen(false);
    setProfileOpen(true);
    setNavLogOpen(false);
    if (panelNow.current !== "full") setPanel("half");
  }, [setPanel, setStopsOpen]);
  const closeProfileCard = useCallback(() => closeCard(() => setProfileOpen(false)), [closeCard]);
  // The map's Stops, put away to the height FPL had (closeCard).
  const closeStops = useCallback(() => closeCard(() => setStopsOpen(false)), [closeCard, setStopsOpen]);
  // Opened: FPL in sight with it, the other cards over FPL and an
  // airport's put away, half way up from the pill, as the Profile opens
  // from its button.
  const openStops = useCallback(() => {
    setStopsOpen(true);
    setTabPick("fpl");
    setNavLogOpen(false);
    setProfileOpen(false);
    setSearchParams(prev => (prev.get("brief") || prev.get("place") ? patched(prev, { brief: null, place: null }) : prev), { replace: true });
    if (panelNow.current !== "full") setPanel("half");
  }, [setStopsOpen, setTabPick, setSearchParams, setPanel]);
  // Find Nearby's tile (the Airport tab): the Stops round the pilot, that
  // kind picked.
  const setStopKind = usePreferences(p => p.setStopKind);
  const findNearby = useCallback((kind: StopKind) => {
    setStopKind(kind);
    setStopsScope("near");
    openStops();
  }, [setStopKind, setStopsScope, openStops]);
  // Put away with the planner.
  useEffect(() => () => setStopsOpen(false), [setStopsOpen]);
  // A field's pin tapped on the chart: its row picked in the sheet, the
  // sheet half way up from the pill so the row is in sight, where the tap
  // opened the field's card (the owner, 2026-10-28: the card is a tap on
  // the row's ident away).
  const setStopPicked = useStopsAlong(st => st.setPicked);
  const pickStopField = useCallback((ident: string) => {
    setStopPicked(ident);
    if (panelNow.current === "peek") setPanel("half");
  }, [setStopPicked, setPanel]);
  // The legs asked for from the Brief: FPL all the way up in its place.
  const showLegs = useCallback(() => {
    setSearchParams(prev => {
      return patched(prev, { brief: null });
    }, { replace: true });
    setPanel("full");
  }, [setSearchParams, setPanel]);
  // The strip's title opens the list in full, over Airport.
  const openNearest = useCallback(() => {
    setSearchParams(prev => {
      return patched(prev, { near: "1" });
    }, { replace: true });
    setPanel("full");
  }, [setSearchParams, setPanel]);
  // And its Back, to Airport's start: the list and the place it was from
  // put away.
  const closeNearest = useCallback(() => {
    setSearchParams(prev => {
      return patched(prev, { near: null, nearAt: null, nearName: null });
    }, { replace: true });
  }, [setSearchParams]);
  // The microphone's own commands (components/pilotCommand, RadioLayer): the
  // Nearest list over Airport, and an approach's page in the procedures
  // sheet, whose lists are the route's fields' alone.
  const plannedStops = planned.stops;
  useEffect(() => {
    useRadioActions.setState({
      nearest: () => {
        setTabPick("airport");
        openNearest();
      },
      showProcedure: async (ident, approach, runway) => {
        if (![planned.dep, ...plannedStops, planned.dest].some(f => f && sameField(f, ident))) return `${ident} is not on the route: add it first.`;
        setProceduresShown({ ident, kind: "approach", pick: { approach, runway } });
        return null;
      },
    });
    return () => useRadioActions.setState({ nearest: null, showProcedure: null });
  }, [setTabPick, openNearest, planned.dep, plannedStops, planned.dest, setProceduresShown]);
  return {
    briefShown, navLogShown, profileShown, stopsShown, briefHere, profileHere, stopsHere, stopsRoute, stopsAt, stopsScope, setStopsScope,
    stopFieldPins, savedOpen, lessonOpen, closeLesson, openSaved, closeSaved, openBrief, closeBrief, openNavLogCard, closeNavLogCard,
    openProfileCard, closeProfileCard, closeStops, openStops, findNearby, pickStopField, showLegs, openNearest, closeNearest,
  };
}
