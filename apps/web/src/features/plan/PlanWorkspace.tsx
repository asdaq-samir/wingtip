import { Suspense, useCallback, useDeferredValue, useMemo } from "react";
import { TEXT } from "../../lib/text";
import { CommandRoot } from "../../components/ui/command";
import { MAX_STOPS } from "../../lib/identSchema";
import type { WorkspaceProps } from "../shell";
import { ShareMenu } from "./ShareMenuLazy";
import { RouteShareMenu, type RouteCard } from "../../lib/openCards";
import { useNavLogs } from "./components/workspace/useNavLogs";
import type { BriefingPart } from "./components/briefing/sections";
import {
  PilotPanel,
  ProceduresRoute,
  FlightBriefingView,
  BriefingNotices,
  SaveFlightButton,
  ReviewAskItem,
  ReviewAskSheet,
  Kneeboard,
  FlightInputs,
  AltitudeGroup,
  BriefNarrative,
} from "./routePanelParts";
import { usePlanWorkspace } from "./hooks/usePlanWorkspace";
import PlanMap from "./components/workspace/PlanMap";
import PlanSidebar from "./components/workspace/PlanSidebar";
import PlanPage from "./components/workspace/PlanPage";
import FlightFoot from "./components/workspace/FlightFoot";
import RouteHead from "./components/workspace/RouteHead";
import RouteControls from "./components/workspace/RouteControls";
import { listSearchOf } from "./components/workspace/listSearch";
import OneSearchField from "./components/search/OneSearchField";
import { useOneSearch } from "./hooks/useOneSearch";

/** The sheet's pages' names (SheetPager), for their bars of the split grabber. */
const PAGE_NAMES = ["Search", "FPL"] as const;

/**
 * The planner: two idents in, a charted course with checkpoints and a
 * dead-reckoning nav log out -- the pilot's workspace on the page
 * (MapPage), which owns the shell around it and the route typed into
 * it.
 *
 * The address is the plan: the route, the altitude, the plan chosen
 * and the departure time are its query parameters, and every stage
 * (usePlan) is a query keyed on the ones it depends on. Loading a
 * route writes the address; a new airplane or departure time changes
 * a key; and the screen is derived from the queries on each render,
 * nothing kept in step by hand.
 *
 * The view (MVVM): what the screen shows and every handler that changes
 * it are the view model's (usePlanWorkspace); this draws it, its parts in
 * components/workspace, and keeps the parts made once for the same plan
 * (useMemo), as the route panel's are drawn again only when their props
 * change (routePanelParts' memo).
 */
export default function PlanWorkspace({ panel, setPanel, children }: WorkspaceProps) {
  const vm = usePlanWorkspace({ panel, setPanel });
  // The one search over the sheet (the owner's one-search design,
  // 2026-11-09): its field the sheet's first row, its results the body's.
  const search = useOneSearch(vm);
  const {
    aircraft,
    aircraftChoices,
    aircraftValue,
    altitudeAt,
    altitudeFt,
    altitudeNearest,
    autoPicked,
    briefShown,
    cardOpen,
    changeAircraft,
    changeDepart,
    course,
    crossings,
    depart,
    directParam,
    directToPoint,
    fileFlightPlan,
    fileable,
    filedProcedures,
    flight,
    flightRules,
    flightToSave,
    flyAltitude,
    flying,
    fuelHidden,
    ground,
    heldPoint,
    holdAsk,
    holds,
    insertStopAfter,
    landedStops,
    landings,
    listEdit,
    metarColour,
    noApproaches,
    openNavLogCard,
    pickPattern,
    pickProcedures,
    pickTail,
    pickedPatterns,
    pickedProcedures,
    pickedTakeoffs,
    place,
    planned,
    preselectPattern,
    preselectTakeoff,
    previewProcedure,
    procedureAirports,
    proceduresAt,
    removeStop,
    routeEdit,
    routeLine,
    routePoints,
    routeProcedures,
    routeRows,
    routed,
    runwayFitInputs,
    s,
    selectPlace,
    selected,
    setApproachesOf,
    setGround,
    setHold,
    setLoad,
    setPointAltitude,
    setProceduresShown,
    setTakeoff,
    showFix,
    showFuelStops,
    stale,
    view,
    pickView,
    tankFigures,
    tightLeg,
    unflyable,
    unflyableBrief,
  } = vm;
  // Each tab's part of the briefing; the Brief's narrative under its Go /
  // No-Go. Made once for the same plan (useCallback, useMemo), and each
  // part drawn again only when its plan changes (FlightBriefingView's
  // memo): a row picked in the nav log drew all four tabs again, the
  // hidden ones and their charts too -- half a second of a phone's.
  const narrative = useMemo(
    () => !s.local && <BriefNarrative ready={!!s.totals} onGenerateNarrative={s.generateNarrative} narrative={s.narrative} />,
    [s.local, s.totals, s.generateNarrative, s.narrative],
  );

  const tabContent = useCallback(
    (part: BriefingPart) => (
      <FlightBriefingView
        part={part}
        nav={s.nav}
        legs={s.legs}
        dep={planned.dep}
        dest={planned.dest}
        // The airports landed at: a waypoint has no weather of its own.
        stops={landedStops}
        route={planned.stops}
        procedures={filedProcedures}
        briefing={s.briefing}
        course={course}
        totals={s.totals}
        depart={depart}
        narrativeText={s.narrative.text}
        problem={unflyableBrief}
        narrative={part === "preflight" ? narrative : undefined}
      />
    ),
    [
      s.nav,
      s.legs,
      planned.dep,
      planned.dest,
      landedStops,
      planned.stops,
      filedProcedures,
      s.briefing,
      course,
      s.totals,
      depart,
      s.narrative.text,
      unflyableBrief,
      narrative,
    ],
  );

  // Print's Kneeboard card, off screen (a portal to the page's body):
  // drawn after what the pilot sees (useDeferredValue), first and as the
  // legs stream in -- it was a part of the route's first draw on a phone,
  // and of each leg's. (Not the Go / No-Go's publishing beside it: Save
  // files the risk assessment it publishes, and drawn later, Save was
  // offered, and pressed, before it was in.)
  const kneeboard = useMemo(
    () => (
      <Kneeboard
        course={course}
        selected={s.logSelected}
        legs={s.legs}
        totals={s.totals}
        nav={s.nav}
        briefing={s.briefing.state === "ready" ? s.briefing.data : null}
        depart={depart}
        aircraftLabel={aircraft.label}
        landings={landings}
      />
    ),
    [course, s.logSelected, s.legs, s.totals, s.nav, s.briefing, depart, aircraft.label, landings],
  );
  const kneeboardLater = useDeferredValue(kneeboard, null);

  const routeList = useMemo(
    () => (
      <>
        <ProceduresRoute
          airports={procedureAirports}
          rows={routeRows}
          depart={depart}
          weather={metarColour}
          picked={pickedPatterns}
          onPick={pickPattern}
          onPreselect={preselectPattern}
          takeoffs={pickedTakeoffs}
          onTakeoff={setTakeoff}
          onPreselectTakeoff={preselectTakeoff}
          autoPicked={autoPicked}
          fit={runwayFitInputs}
          procedures={pickedProcedures}
          inRoute={routeProcedures}
          onProcedures={pickProcedures}
          onPreview={previewProcedure}
          at={proceduresAt}
          onAt={setProceduresShown}
          crossings={crossings}
          onFix={showFix}
          onDepart={changeDepart}
          ground={ground}
          onGround={setGround}
          pointAltitude={altitudeAt}
          onPointAltitude={setPointAltitude}
          directTo={directParam}
          onDirectTo={directToPoint}
          onInfo={selectPlace}
          onRemove={removeStop}
          onCreateFix={insertStopAfter}
          holds={holds}
          onHoldSet={setHold}
          askHold={holdAsk}
          routePoints={routePoints}
          stopsFull={planned.stops.length >= MAX_STOPS}
          fuel={tankFigures}
          onCharts={() => {
            if (planned.dest) {
              setApproachesOf(planned.dest);
              selectPlace(planned.dest);
            }
          }}
          chartsDisabled={!planned.dest || noApproaches}
          // In Route Cards the Routes row is in the head's box with the
          // controls (the route slot, below), not over the list.
          routeLine={routeEdit === "plan" ? null : routeLine}
          // The list changes the route too where the box is folded away once
          // the route is whole (RouteEdit, both of the owner's picks).
          // Not with the box as it was, whose pills do it.
          edit={routeEdit !== "box" && planned.dep && planned.dest ? listEdit : undefined}
        />
      </>
    ),
    [
      routeLine,
      procedureAirports,
      routeRows,
      depart,
      metarColour,
      pickedPatterns,
      pickPattern,
      preselectPattern,
      pickedTakeoffs,
      setTakeoff,
      preselectTakeoff,
      autoPicked,
      runwayFitInputs,
      pickedProcedures,
      routeProcedures,
      pickProcedures,
      crossings,
      showFix,
      ground,
      setGround,
      previewProcedure,
      proceduresAt,
      setProceduresShown,
      planned.dep,
      planned.dest,
      setApproachesOf,
      selectPlace,
      noApproaches,
      changeDepart,
      altitudeAt,
      setPointAltitude,
      directParam,
      directToPoint,
      removeStop,
      insertStopAfter,
      holds,
      setHold,
      holdAsk,
      routePoints,
      planned.stops.length,
      tankFigures,
      listEdit,
      routeEdit,
    ],
  );

  const { navLog, navLogCard } = useNavLogs(vm, { tabContent, routeList, kneeboard: kneeboardLater });

  // The Brief's pages (BriefCard): En route's without the legs, which are
  // FPL's own; and its warnings over them.
  const briefContents = useMemo(
    () => ({
      preflight: tabContent("preflight"),
      depart: tabContent("depart"),
      enroute: (
        <section aria-label="En route" className={TEXT.prose}>
          {!s.local && tabContent("profile")}
          {tabContent("enroute")}
        </section>
      ),
      arrive: tabContent("arrive"),
    }),
    [tabContent, s.local],
  );
  const briefNotice = useMemo(() => <BriefingNotices briefing={s.briefing} />, [s.briefing]);

  const flightInputs = useMemo(
    () => (
      <FlightInputs
        aircraftValue={aircraftValue}
        aircraftOptions={aircraftChoices}
        onTailPick={pickTail}
        onAircraftChange={changeAircraft}
        altitude={
          !s.local && (
            <AltitudeGroup
              nav={s.nav}
              legs={s.legs}
              onFlyAltitude={flyAltitude}
              // The altitude asked for, at once, while its log is planned, and
              // with no log yet: with no route the figure typed went blank, as
              // if it were not taken, where the route entered next flies it.
              commanded={(s.replanning || !s.nav) && altitudeFt ? Number(altitudeFt) : null}
              asked={altitudeFt ? { ft: Number(altitudeFt), nearest: altitudeNearest } : null}
              problem={!!unflyable}
              // What the altitude was planned within, marked on the group, said
              // in the Profile card (AltitudeProfile).
              tight={unflyable ? null : tightLeg}
              disabled={!routed}
              rules={flightRules}
            />
          )
        }
        // The departure's time on its step in FPL's list (ProceduresRoute),
        // not beside the altitude, at the owner's asks ("The departure time
        // can move from the route box to the departure and arrival boxes";
        // "Departure time doesn't need to be next to altitude selection
        // anymore"): here only for a local flight, which has no departure
        // step and no altitude, beside its time aloft.
        depart={depart}
        onDepartChange={s.local ? changeDepart : undefined}
      />
    ),
    [
      aircraftValue,
      aircraftChoices,
      changeAircraft,
      pickTail,
      s.local,
      s.nav,
      s.legs,
      flyAltitude,
      unflyable,
      tightLeg,
      routed,
      depart,
      changeDepart,
      flightRules,
      s.replanning,
      altitudeFt,
      altitudeNearest,
    ],
  );

  const shareMenu = (align: "start" | "end", testId?: string, card?: RouteCard) => (
    <ShareMenu
      align={align}
      testId={testId}
      card={card}
      planned={planned}
      course={course}
      selected={selected}
      altitudeFt={s.nav?.altitude_ft ?? undefined}
      routed={routed}
      local={!!s.local}
      fileable={fileable}
      onFile={fileFlightPlan}
      saving={(askReview) => (
        <Suspense fallback={null}>
          <SaveFlightButton {...flightToSave} />
          <ReviewAskItem flight={flightToSave} onAsk={askReview} />
        </Suspense>
      )}
      reviewSheet={(done) => (
        <Suspense fallback={null}>
          <ReviewAskSheet flight={flightToSave} onDone={done} />
        </Suspense>
      )}
      // Plan again in the route's own menu, at the owner's pick ("A") to
      // keep the route box's row on one line; Share marked where it is due.
      planAgain={card === undefined && routed && !s.local ? { stale, onPlan: () => setLoad((n) => n + 1) } : undefined}
      onShowFuel={card === undefined && fuelHidden ? showFuelStops : undefined}
      onNavLog={card === undefined && routed && course ? openNavLogCard : undefined}
      onClear={card === undefined ? vm.clearRoute : undefined}
    />
  );

  // The route's Share menu for its cards' heads (CardClose).
  return (
    <RouteShareMenu.Provider value={(card: RouteCard) => shareMenu("start", "card-share", card)}>
      {children({
        // The map stays mounted beside the briefing (the arrow walk still
        // pans it) but stays off the paper: the drawer is the printed page.
        map: <PlanMap vm={vm} />,
        // The tab's body (TabBar): FPL's nav log, kept mounted under whatever
        // is open over it and on paper; Airport's search, its Favorites and
        // Recents and what answers, or Nearest's list; Aircraft's list. A card --
        // an airport's, the airspace's, an airplane's -- over the tab it was
        // opened from, its close back to it.
        sidebar: <PlanSidebar vm={vm} model={search} />,
        // The pages (SheetPager, the owner 2026-11-11): Search over `sidebar`, FPL's `route` over the plan.
        pages: {
          at: view === "plan" ? 1 : 0,
          go: (page) => pickView(page ? "plan" : "search"),
          names: PAGE_NAMES,
          second: <PlanPage vm={vm} navLog={navLog} navLogCard={navLogCard} briefContents={briefContents} briefNotice={briefNotice} />,
        },
        // The one search's Autocomplete round the whole panel, so its field
        // (the first row) and its list (the body) are one combobox.
        around: (panel) => (
          <CommandRoot value={vm.query} onValueChange={search.setTyped} autoHighlight="always">
            {panel}
          </CommandRoot>
        ),
        // A card over the page: its card alone, the page's head gone while it is open, at the pilot's ask.
        alone: cardOpen || briefShown,
        // Any card over the page it was opened from, its bar its name with Back and the close, at the
        // owner's asks ("the back button should get it back to fpl"; "replace tabs with a back close button").
        cardOver: cardOpen || briefShown,
        toEdge: !!place,
        flying,
        // The one search, the first page's first row, and at rest its pill (MapPanel).
        bar: <OneSearchField model={search} inputRef={vm.searchInput} list={listSearchOf(vm)} />,
        // FPL's alone ("Fpl can show calculations but other tabs should show something else").
        // FPL's figures pinned at the sheet's foot at every height, the pill's
        // too, growing as it comes up, at the owner's asks ("While dragging fpl
        // keep the calculations pinned at the bottom"; "Why can't the half card
        // have calculations pinned at the very bottom as the full card, just
        // make them bigger smoothly as expanded").
        // A dry run's chart in the side view's place and its size, at every
        // height: still as the sheet is dragged, the nav log coming out over it,
        // as the side view is, at the owner's ask ("the dry run drags up instead
        // of staying still like the profile"); all the way up the log scrolls
        // over it and follows the run (NavLogView), at the owner's ask ("I wanna
        // be able to do the dry run with navlog in full fpl"). It took the
        // body's room half way, and grew with the sheet under a finger.
        // At the pill on FPL they are the pill's one row (MapPanel), the
        // route's row from half up (the owner, 2026-11-11, the canvas's b).
        foot: view === "plan" && !place && !heldPoint && !flight && !briefShown ? routed && <FlightFoot vm={vm} /> : undefined,
        // The route as one box of pills, in place of the two airport fields,
        // the top row to itself, at the pilot's ask: its close and its
        // Procedures beside it went to the chips' row (Approaches) and the
        // Share menu (Clear the route). An airport twice (a round trip with its
        // stop taken out) keeps the box, its notice saying what to change.
        // Whatever the tab: MapPanel keeps it under the others' heads (`kept`).
        // Once the route is whole, folded away (lib/preferences RouteEdit, the
        // owner's A and B of the FPL canvas, 2026-11-05: "keeping the route box
        // on top after a destination is known is redundant because the plan
        // at the bottom can have dragables"): the route on one line, a tap the
        // box again (A), or its name over the plan whose rows change it (B);
        // the airplane, the altitude and the route's buttons under either, as
        // they were under the box. The box again while a stop is typed in
        // from the list or a problem, and while it is opened from the head;
        // with no route either, the head folded (the owner, 2026-11-05).
        route: <RouteHead vm={vm} controls={<RouteControls vm={vm} flightInputs={flightInputs} share={shareMenu("end")} />} />,
        console: <PilotPanel />,
      })}
    </RouteShareMenu.Provider>
  );
}
