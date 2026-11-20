import { Suspense, useCallback, useDeferredValue, useMemo } from "react";
import { TEXT } from "../../lib/text";
import { CommandRoot } from "../../components/ui/command";
import type { WorkspaceProps } from "../../lib/workspace";
import { ShareMenu } from "../share";
import { RouteShareMenu, type RouteCard } from "../../lib/openCards";
import { useNavLogs } from "./workspace/useNavLogs";
import { useProceduresRoute } from "./workspace/useProceduresRoute";
import type { BriefingPart } from "../plan";
import {
  PilotPanel,
  FlightBriefingView,
  BriefingNotices,
  SaveFlightButton,
  ReviewAskItem,
  ReviewAskSheet,
  Kneeboard,
  FlightInputs,
  AltitudeGroup,
} from "./routePanelParts";
import { usePlanWorkspace } from "./vm/usePlanWorkspace";
import PlanMap from "./workspace/PlanMap";
import PlanSidebar from "./workspace/PlanSidebar";
import PlanPage from "./workspace/PlanPage";
import PlanCards from "./workspace/PlanCards";
import FlightFoot from "./workspace/FlightFoot";
import { FplRoute } from "./workspace/FplActions";
import RouteControls from "./workspace/RouteControls";
import FplBar from "./workspace/FplBar";
import { Search } from "lucide-react";
import IconButton from "../../components/IconButton";
import { askSearch } from "../../lib/oneSearch";
import { useConfirm } from "../../components/useConfirm";
import { routesOffered } from "./workspace/routeEditing";
import OneSearchField from "./search/OneSearchField";
import { useOneSearch } from "./search/useOneSearch";

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
 * workspace/, and keeps the parts made once for the same plan
 * (useMemo), as the route panel's are drawn again only when their props
 * change (routePanelParts' memo).
 */
export default function PlanWorkspace({ panel, setPanel, children }: WorkspaceProps) {
  const vm = usePlanWorkspace({ panel, setPanel });
  // The one search over the sheet (the owner's one-search design,
  // 2026-11-09): its field the sheet's first row, its results the body's.
  const search = useOneSearch(vm);
  const { view, pickPage } = vm.view;
  const { altitudeFt, altitudeNearest, depart, flightRules, flyAltitude, planned, routed, setLoad } = vm.route;
  const { aircraft, aircraftChoices, aircraftValue, changeAircraft, changeDepart, course, pickTail, s, selected } = vm.plan;
  const { cardOpen, flight, heldPoint, place } = vm.cards;
  const { filedProcedures } = vm.picks;
  const { fuelHidden, showFuelStops } = vm.stops;
  const { briefShown, profileShown } = vm.fpl;
  const { flying } = vm.flight;
  const { fileFlightPlan, fileable, flightToSave, landedStops, landings, stale, tightLeg, unflyable, unflyableBrief } = vm.brief;
  // Each tab's part of the briefing. Made once for the same plan
  // (useCallback), and each
  // part drawn again only when its plan changes (FlightBriefingView's
  // memo): a row picked in the nav log drew all four tabs again, the
  // hidden ones and their charts too -- half a second of a phone's.
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
        problem={unflyableBrief}
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
      unflyableBrief,
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

  const routeList = useProceduresRoute(vm);

  const { navLog, navLogCard } = useNavLogs(vm, { tabContent, routeList, kneeboard: kneeboardLater });

  // The Brief's pages (BriefCard): En route's without the legs, which are
  // FPL's own; and its warnings over them.
  const briefContents = useMemo(
    () => ({
      preflight: tabContent("preflight"),
      depart: tabContent("depart"),
      enroute: (
        <section aria-label="En Route" className={TEXT.prose}>
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

  // FPL's ✕ held asks to clear the route (the owner, 2026-11-20), as
  // More's Clear route does at a tap; the plan's Undo brings it back.
  const [askClear, clearAsked] = useConfirm({
    title: "Clear Route?",
    description: "The route's points, stops and procedures come off the plan. Undo brings them back.",
    confirmLabel: "Clear Route",
    destructive: true,
    onConfirm: vm.routeList.clearRoute,
  });
  const shareMenu = (align: "start" | "end", testId?: string, card?: RouteCard, look?: "bar" | "tile" | "head") => (
    <ShareMenu
      look={look}
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
      // The suggested routes, More's first item while there are some.
      routeOptions={
        card === undefined && routesOffered(vm) ? { shown: vm.routeList.routesShown, onShown: vm.routeList.setRoutesShown } : undefined
      }
      // The route's field over its timeline, to type or paste it in whole.
      onTypeRoute={
        card === undefined && vm.route.wholeRoute && vm.routeList.routeFolded && !vm.flight.flying
          ? () => vm.routeList.setRouteOpen(true)
          : undefined
      }
      // The route's Clear, last in More; half a route's is the route box's ✕
      // (RouteEditor), and the empty page has nothing to clear.
      onClear={card === undefined && vm.route.hasPoints ? vm.routeList.clearRoute : undefined}
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
        // The pages, turned by the toggle at the first row's end (PageToggle): Search over `sidebar`; FPL its bar (FplBar), `route` and the plan.
        pages: {
          at: view === "plan" ? 1 : 0,
          go: pickPage,
          floats: !flying && !vm.flight.dryRunning,
          // The first row is FPL's title between Share and the ✕, as Apple
          // Maps' Directions (the owner, 2026-11-19: "Maybe we can have
          // similar buttons x and share"); Share only once there is a route.
          // Under the title, between the buttons, the airplane's pills (the
          // owner: "Make two rows between the close and share button").
          bar: (
            <>
              <FplBar
                // Search at the head's start, where Share was (the owner,
                // 2026-11-20: "replace the share button with search button");
                // the sharing is More's (FplTabBar).
                share={
                  <IconButton round label="Search" onClick={() => askSearch()} data-testid="fpl-search">
                    <Search className="size-5" aria-hidden="true" />
                  </IconButton>
                }
                strip={<RouteControls vm={vm} flightInputs={flightInputs} />}
                onHold={vm.route.hasPoints ? askClear : undefined}
              />
              {clearAsked}
            </>
          ),
          second: <PlanPage vm={vm} navLog={navLog} more={shareMenu("end", undefined, undefined, "tile")} />,
        },
        // The one search's Autocomplete round the whole panel: its field (the first row) and its list (the body) one combobox.
        around: (panel) => (
          <CommandRoot value={vm.search.query} onValueChange={search.setTyped} autoHighlight="always">
            {panel}
          </CommandRoot>
        ),
        // A card over the page: its card alone, the page's head gone while it is open, at the pilot's ask.
        alone: cardOpen || briefShown,
        toEdge: !!place,
        flying,
        // The one search, the first page's first row, and at rest its pill (MapPanel).
        bar: <OneSearchField model={search} inputRef={vm.search.searchInput} />,
        // FPL's foot (FlightFoot): from half up its actions' floating bar, at the pill its figures alone, large,
        // under the route from half up (the owner, 2026-11-16); in flight the figures; under the Profile, its card's (PlanCards).
        foot:
          !place && !heldPoint && !flight && !briefShown && !profileShown
            ? routed && <FlightFoot vm={vm} more={shareMenu("end", undefined, undefined, "bar")} />
            : undefined,
        // The route under FPL's bar (MapPanel keeps it under the others'
        // heads), in its one layout (the owner, 2026-11-17, decision 0047):
        // folded to its line, the figures and the Routes' chips under it, or
        // open to edit, its head over the cards in the page (FplRoute).
        route: <FplRoute vm={vm} />,
        console: <PilotPanel />,
      })}
      {/* FPL's cards over the sheet, beside its pages, kept in flight (PlanCards). */}
      <PlanCards vm={vm} navLogCard={navLogCard} briefContents={briefContents} briefNotice={briefNotice} />
    </RouteShareMenu.Provider>
  );
}
