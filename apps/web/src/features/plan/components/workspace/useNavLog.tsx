import { Suspense, useMemo, type ReactNode } from "react";
import type { BriefingPart } from "../briefing/sections";
import { BriefingNotices, FlightBriefingView, NavLogView } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import { EngineGate } from "../../../../lib/engine/engineGate";

/**
 * The plan's nav log (PlanWorkspace), the Nav Log's tab (FplTabs): the
 * route in order and its legs under it, with on paper the whole briefing
 * and, out of sight, what the briefing publishes and the kneeboard; made
 * once for the same plan.
 */
export function useNavLog(
  vm: PlanWorkspaceModel,
  { tabContent, routeList, kneeboard }: { tabContent: (part: BriefingPart) => ReactNode; routeList: ReactNode; kneeboard: ReactNode },
) {
  const { drawerOpen } = vm.view;
  const { depart, planned, routeEdit } = vm.route;
  const { aircraft, course, s } = vm.plan;
  const { navLogShown } = vm.fpl;
  const { dryRunning } = vm.flight;
  const { deselectPoint, selectPointAt, selectedPoint } = vm.leg;
  const { landedStops, marks, metarColour, unflyableBrief } = vm.brief;

  const shared = useMemo(
    () => ({
      totals: s.totals,
      nav: s.nav,
      legs: s.legs,
      depart,
      dep: planned.dep,
      dest: planned.dest,
      ends: course,
      selected: s.logSelected,
      descriptions: s.descriptions,
      onSaveDescription: s.saveDescription,
      selectedPoint,
      onSelectPoint: selectPointAt,
      onDeselectPoint: deselectPoint,
      dryRun: dryRunning,
      aircraftLabel: aircraft.label,
      marks,
      tabContent,
      local: s.local,
      metarColourOf: metarColour,
    }),
    [
      s.totals,
      s.nav,
      s.legs,
      depart,
      planned.dep,
      planned.dest,
      course,
      s.logSelected,
      s.descriptions,
      s.saveDescription,
      selectedPoint,
      selectPointAt,
      deselectPoint,
      dryRunning,
      aircraft.label,
      marks,
      tabContent,
      s.local,
      metarColour,
    ],
  );

  const navLog = useMemo(
    () => (
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <NavLogView
          {...shared}
          // In sight all the way up, its tab up: a row picked is brought
          // into sight as it comes back.
          drawerOpen={drawerOpen && navLogShown}
          // Route Cards with one end only: its card is the end's own (RouteEnds),
          // not again under it as the list's row (the owner's screenshot,
          // 2026-11-05: C81 typed as the departure, there twice).
          route={routeEdit === "plan" && !(planned.dep && planned.dest) ? undefined : routeList}
          notice={<BriefingNotices briefing={s.briefing} />}
        >
          {/* Out of the tabs, drawing nothing: the risk assessment and the
          Go / No-Go's findings published once, for Save and the tabs' marks;
          after the engine is in, as it asks it (radio_call_sign) from the
          page's first paint (firstDraw.test, 2026-11-11). */}
          <EngineGate>
            <FlightBriefingView
              part={null}
              publish
              nav={s.nav}
              legs={s.legs}
              dep={planned.dep}
              dest={planned.dest}
              stops={landedStops}
              briefing={s.briefing}
              course={course}
              totals={s.totals}
              depart={depart}
              problem={unflyableBrief}
            />
          </EngineGate>
          {kneeboard}
        </NavLogView>
      </Suspense>
    ),
    [
      shared,
      s.totals,
      s.nav,
      s.legs,
      depart,
      planned.dep,
      planned.dest,
      course,
      s.briefing,
      landedStops,
      unflyableBrief,
      kneeboard,
      drawerOpen,
      navLogShown,
      routeList,
      routeEdit,
    ],
  );
  return navLog;
}
