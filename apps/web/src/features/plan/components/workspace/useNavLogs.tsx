import { Suspense, useMemo, type ReactNode } from "react";
import { CardHead } from "../../../../components/CardHead";
import PaidPrompt from "../../../../components/PaidPromptLazy";
import type { BriefingPart } from "../briefing/sections";
import { BriefingNotices, FlightBriefingView, NavLogView } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import { EngineGate } from "../../../../lib/engine/engineGate";
import FiguresLine from "./FiguresLine";

/**
 * The plan's two nav logs (PlanWorkspace): FPL's own list -- the route in
 * order, with on paper the whole briefing and, out of sight, what the
 * briefing publishes and the kneeboard -- and the Nav Log card's legs
 * (PlanPage's NavLogCard), each made once for the same plan.
 */
export function useNavLogs(
  vm: PlanWorkspaceModel,
  { tabContent, routeList, kneeboard }: { tabContent: (part: BriefingPart) => ReactNode; routeList: ReactNode; kneeboard: ReactNode },
) {
  const {
    aircraft,
    briefLine,
    briefShown,
    closeNavLogCard,
    course,
    depart,
    descriptionsHidden,
    descriptionsLoading,
    deselectPoint,
    drawerOpen,
    dryRunning,
    estimate,
    landedStops,
    marks,
    metarColour,
    navLogShown,
    paywalled,
    planned,
    routeEdit,
    s,
    selectPointAt,
    selectedPoint,
    unflyableBrief,
  } = vm;
  const descriptionsPaywall = useMemo(
    () =>
      paywalled ? (
        <PaidPrompt feature="CHECKPOINT_NOTES">A line for each checkpoint on what to look for from the air.</PaidPrompt>
      ) : undefined,
    [paywalled],
  );

  const navLog = useMemo(
    () => (
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <NavLogView
          totals={s.totals}
          nav={s.nav}
          legs={s.legs}
          descriptionError={s.descriptionError}
          depart={depart}
          dep={planned.dep}
          dest={planned.dest}
          ends={course}
          selected={s.logSelected}
          descriptions={s.descriptions}
          onSaveDescription={s.saveDescription}
          onGenerateDescriptions={s.generateDescriptions}
          descriptionsLoading={descriptionsLoading}
          descriptionsPaywall={descriptionsPaywall}
          descriptionsHidden={descriptionsHidden}
          selectedPoint={selectedPoint}
          onSelectPoint={selectPointAt}
          onDeselectPoint={deselectPoint}
          // In sight all the way up, the Brief not over it: a row picked is
          // brought into sight as it comes back.
          drawerOpen={drawerOpen && !briefShown}
          dryRun={dryRunning}
          // Route Cards with one end only: its card is the end's own (RouteEnds),
          // not again under it as the list's row (the owner's screenshot,
          // 2026-11-05: C81 typed as the departure, there twice).
          route={routeEdit === "plan" && !(planned.dep && planned.dest) ? undefined : routeList}
          aircraftLabel={aircraft.label}
          marks={marks}
          tabContent={tabContent}
          notice={<BriefingNotices briefing={s.briefing} />}

          local={s.local}
          metarColourOf={metarColour}
        >
          {/* Out of the tabs, drawing nothing: the risk assessment and the
          Go / No-Go's findings published once, for Save and the tabs' marks. */}
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
            narrativeText={s.narrative.text}
            problem={unflyableBrief}
          />
          {kneeboard}
        </NavLogView>
      </Suspense>
    ),
    [
      s.totals,
      s.descriptionError,
      s.nav,
      s.legs,
      depart,
      planned.dep,
      planned.dest,
      course,
      s.logSelected,
      s.descriptions,
      s.saveDescription,
      s.generateDescriptions,
      descriptionsLoading,
      descriptionsPaywall,
      descriptionsHidden,
      selectedPoint,
      selectPointAt,
      deselectPoint,
      drawerOpen,
      aircraft.label,
      marks,
      tabContent,
      s.briefing,
      s.local,
      landedStops,
      s.narrative.text,
      unflyableBrief,
      kneeboard,
      metarColour,
      dryRunning,
      briefShown,
      routeList,
      routeEdit,
    ],
  );
  // The Nav Log, a card of its own over FPL (the owner, 2026-11-11), its
  // legs in it: drawn from its first opening on and kept between its
  // openings (PlanPage's NavLogCard), so it is built once.
  const navLogCard = useMemo(
    () => (
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <NavLogView
          totals={s.totals}
          nav={s.nav}
          legs={s.legs}
          descriptionError={s.descriptionError}
          depart={depart}
          dep={planned.dep}
          dest={planned.dest}
          ends={course}
          selected={s.logSelected}
          descriptions={s.descriptions}
          onSaveDescription={s.saveDescription}
          onGenerateDescriptions={s.generateDescriptions}
          descriptionsLoading={descriptionsLoading}
          descriptionsPaywall={descriptionsPaywall}
          descriptionsHidden={descriptionsHidden}
          selectedPoint={selectedPoint}
          onSelectPoint={selectPointAt}
          onDeselectPoint={deselectPoint}
          // A row picked is brought into sight while the card is open.
          drawerOpen={navLogShown}
          dryRun={dryRunning}
          cardHead={
            <CardHead
              // Its own name, and at its smallest size too the totals under
              // it (the canvas's Nav Log card): the line the route's figures
              // carried at the sheet's foot.
              name="Nav Log"
              sub={
                <EngineGate>
                  <FiguresLine input={{ totals: s.totals, estimate, local: s.local, destination: `${planned.dest}`, depart }} />
                </EngineGate>
              }
              line={briefLine}
              nameTestId="navlog-name"
              onClose={closeNavLogCard}
              onShare="navlog"
              closeTestId="navlog-close"
            />
          }
          aircraftLabel={aircraft.label}
          marks={marks}
          tabContent={tabContent}
          local={s.local}
          metarColourOf={metarColour}
        />
      </Suspense>
    ),
    [
      estimate,
      s.totals,
      s.descriptionError,
      s.nav,
      s.legs,
      depart,
      planned.dep,
      planned.dest,
      course,
      s.logSelected,
      s.descriptions,
      s.saveDescription,
      s.generateDescriptions,
      descriptionsLoading,
      descriptionsPaywall,
      descriptionsHidden,
      selectedPoint,
      selectPointAt,
      deselectPoint,
      navLogShown,
      dryRunning,
      briefLine,
      closeNavLogCard,
      aircraft.label,
      marks,
      tabContent,
      s.local,
      metarColour,
    ],
  );
  return { navLog, navLogCard };
}
