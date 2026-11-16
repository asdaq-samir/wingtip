import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, SetAddress } from "../../../lib/address";
import type { PanelState } from "../../../lib/mapChrome";
import { useRadioActions } from "../../../lib/atcRadio";
import { lessonOf } from "../../../lib/lessonLink";
import { usePreferences } from "../../../lib/preferences";
import { sameField } from "../../../lib/procedures";
import { stopsAlongQuery, stopsNearQuery } from "../../../lib/queryClient";
import { kindsOf, type StopKind } from "../../../lib/stopKinds";
import { useStopsAlong } from "../lib/stopsAlong";
import { setCard, useSheetCards } from "../../../lib/sheetCards";
import type { ProceduresAt } from "../components/ProceduresRoute";
import { riseToSee } from "./panelNow";
import type { PlannedRoute } from "./planAddress";
import type { PanelView } from "./usePanelView";
import { useOpenScreen } from "./useOpenScreen";

/** FPL's tabs under its route (FplTabs): the Nav Log first. */
export type FplTab = "navlog" | "brief" | "profile";

/** The Stops card's id among the cards (CardLayer), for its pins' taps. */
export const STOPS_CARD = "stops";

/**
 * FPL's tabs and cards, and the lists in full (usePlanWorkspace): the Nav
 * Log, the Brief and the Profile as tabs under the route (FplTabs; the
 * owner, 2026-11-14), the map's Stops a card sizing its own drawer
 * (CardStack), opening by the card rule; Saved, Nearest and an
 * instructor's lesson. A list opened
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
  address,
  setAddress,
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
  address: Address;
  setAddress: SetAddress;
  setProceduresShown: (at: ProceduresAt) => void;
}) {
  // FPL's tab picked under its route (FplTabs; the owner, 2026-11-14: "the
  // same tab bar ... with brief, navlog, profile"): the Nav Log, FPL's
  // first, or the Profile here; the Brief is the address's (`brief=1`), so
  // a link opens on it.
  const [pickedTab, setPickedTab] = useState<"navlog" | "profile">("navlog");
  const fplTab: FplTab = briefOpen ? "brief" : pickedTab;
  // Each tab in sight: FPL up, over a route.
  const onFpl = view === "plan" && routed;
  const briefShown = onFpl && fplTab === "brief";
  const navLogShown = onFpl && fplTab === "navlog";
  const profileShown = onFpl && fplTab === "profile";
  // The Profile picked, in sight or not: a dry run is its, and goes when
  // another tab is picked (useDryRun).
  const profileOpen = routed && fplTab === "profile";
  // The map's Stops (StopsCard), a card over FPL, opened from the Airport
  // tab's Find Nearby (its button among the map's gave its place to the
  // radio's microphone, 2026-11-02).
  const stopsOpen = useStopsAlong((st) => st.open);
  const setStopsOpen = useStopsAlong((st) => st.setOpen);
  // The page the Stops were opened from, which their close goes back to
  // (docs/design/rules.md, card rule 1: ✕ goes back): Search's Find Nearby
  // keeps Search under them, where they took the sheet to FPL and left it there.
  const [stopsFrom, setStopsFrom] = useState<PanelView>("plan");
  // With a route or none: with none, the stops are round the pilot.
  const stopsShown = stopsOpen && (view === "plan" || view === stopsFrom);
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
  const savedOpen = address.saved;
  // An approach set by their instructor, open over the map until closed.
  const lessonOpen = lessonOf(address.lesson);
  const closeLesson = useCallback(() => {
    void setAddress({ lesson: null });
  }, [setAddress]);
  // Each written in place of the address's last, as every panel change is
  // (lib/backNavigation): they pushed onto the history, the browser's Back stepping
  // through Saved and Nearest alone of the lists.
  const openSaved = useCallback(() => {
    void setAddress({ saved: true });
    riseToSee(setPanel);
  }, [setAddress, setPanel]);
  // And back from it to FPL's start, its own Back (FlightsPanel's head).
  const closeSaved = useCallback(() => {
    void setAddress({ saved: null });
  }, [setAddress]);
  // A tab picked, from the bar or by the app: the Brief by the address,
  // the others in its place, the map's Stops put away to show it.
  const pickTab = useCallback(
    (tab: FplTab) => {
      if (tab !== "brief") setPickedTab(tab);
      if ((tab === "brief") !== briefOpen) void setAddress({ brief: tab === "brief" ? true : null });
    },
    [briefOpen, setAddress],
  );
  const openTab = useCallback(
    (tab: FplTab) => {
      setStopsOpen(false);
      pickTab(tab);
    },
    [setStopsOpen, pickTab],
  );
  const openBrief = useCallback(() => openTab("brief"), [openTab]);
  const openNavLog = useCallback(() => openTab("navlog"), [openTab]);
  const openProfileTab = useCallback(() => openTab("profile"), [openTab]);
  // The map's Stops put away, the sheet where it is, on the page they were
  // opened from.
  const closeStops = useCallback(() => {
    setStopsOpen(false);
    if (stopsFrom !== view) setViewPick(stopsFrom);
  }, [setStopsOpen, stopsFrom, view, setViewPick]);
  // Opened: an airport's card put away; the card
  // opens by the card rule, as the Profile's, over the page it was asked
  // from (Search's Find Nearby, round the pilot), that page remembered for
  // its close.
  const openStops = useCallback(() => {
    setStopsOpen(true);
    setStopsFrom(view);
    void setAddress({ place: null });
  }, [setStopsOpen, setAddress, view]);
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
  // The legs asked for from the Brief: the Nav Log's tab, the sheet at the
  // size the pilot left it (half from the pill).
  const showLegs = useCallback(() => {
    pickTab("navlog");
    riseToSee(setPanel);
  }, [pickTab, setPanel]);
  // The strip's title opens the list in full, over Airport: its card all
  // the way up (NearestCard's `opens`).
  const openNearest = useCallback(() => {
    void setAddress({ near: true });
  }, [setAddress]);
  // And its Back, to Airport's start: the list and the place it was from
  // put away.
  const closeNearest = useCallback(() => {
    void setAddress({ near: null, nearAt: null, nearName: null });
  }, [setAddress]);
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
  useOpenScreen({ routed, address, setAddress, setViewPick, setPanel, openBrief, openNavLog, openProfileTab, openNearest });
  return {
    fplTab,
    pickTab,
    briefShown,
    navLogShown,
    profileShown,
    profileOpen,
    stopsShown,
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
    openNavLog,
    openProfileTab,
    closeStops,
    findNearby,
    pickStopField,
    showLegs,
    openNearest,
    closeNearest,
  };
}
