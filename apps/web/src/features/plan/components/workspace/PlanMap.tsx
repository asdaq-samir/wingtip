import { Suspense, lazy, useState } from "react";
import { cn } from "cn";
import { RouteMap } from "../../routeMapChunk";
import FirstFlight from "../FirstFlight";
import { FlyingHead } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import { DRY_RUN, usePastFlight } from "../../map/pastFlight";

/** An approach the pilot's instructor set them, opened from their
 *  Checkride page (`?lesson=12`): its own chunk, as the lesson's is. */
import { ReadyToFlyPrompt } from "../../../readyToFly";
import { EngineGate } from "../../../../lib/engine/engineGate";

const AssignedLesson = lazy(() => import("../AssignedLesson"));
/** What the first screen does not draw, each its own chunk off the first
 *  load (scripts/first-load.mjs's budget): a fix's card and a leg's, from
 *  their first tap on. */
const FixCard = lazy(() => import("../FixCard"));
const RouteLegCard = lazy(() => import("../RouteLegCard"));

/** The map beside the briefing (PlanWorkspace's `map`), with what floats
 *  over it: the next checkpoint in flight, a fix's card, an assigned
 *  approach, Ready to Fly and the first flight's welcome and tip. */
export default function PlanMap({ vm }: { vm: PlanWorkspaceModel }) {
  const dryPlaying = usePastFlight((p) => p.hex === DRY_RUN && p.playing);
  const { panelOpen } = vm.view;
  const { crossings, routed, setRoute } = vm.route;
  const { course, s, selected } = vm.plan;
  const { heldPoint, holdPoint, nearOpen, selectPlaceOnChart } = vm.cards;
  const {
    directTo,
    fitAircraft,
    flownPatterns,
    mapDirects,
    mapProcedures,
    openFix,
    patternFocus,
    procedureFocus,
    setCrossing,
    setOpenFixAt,
    showFix,
  } = vm.picks;
  const { nearestPoints, placePin, startPin } = vm.map;
  const { fuelStopPins } = vm.stops;
  const { lineKey, pickWay, wayLines } = vm.routeList;
  const { closeLesson, lessonOpen, pickStopField, stopFieldPins } = vm.fpl;
  const { dryRunning, flying } = vm.flight;
  const { closeLeg, mapLegs, openLeg, pickPoint, routeRows, selectCandidate, selectedPoint, setLegAt } = vm.leg;
  // Each card's chunk asked for at its first open, then kept.
  const [fixSeen, setFixSeen] = useState(false);
  if (openFix && !fixSeen) setFixSeen(true);
  const [legSeen, setLegSeen] = useState(false);
  if (openLeg && !legSeen) setLegSeen(true);
  return (
    <div className={cn("h-full w-full", panelOpen && "print:hidden")}>
      {/* Its own boundary: the map's chunk (routeMapChunk) comes after the
          panel's first script, and without one the page's (MapPage)
          held the panel back, blank, until it had. */}
      {/* Ready to fly, once, as a dry run or own ship starts with something
          to fix (features/readyToFly): a dialog over the map, nothing moved.
          Its findings are the engine's, so once that is there. */}
      <EngineGate>
        <ReadyToFlyPrompt dryPlaying={dryPlaying} />
      </EngineGate>
      <Suspense fallback={null}>
        <RouteMap
          course={course}
          candidates={s.candidates}
          selected={selected}
          focus={selectedPoint}
          onSelectCandidate={selectCandidate}
          onSelectPoint={pickPoint}
          airportWeather={s.briefing}
          patterns={flownPatterns}
          patternFocus={patternFocus}
          procedures={mapProcedures}
          procedureFocus={procedureFocus}
          place={placePin}
          start={startPin}
          nearest={nearOpen ? nearestPoints : null}
          onSelectPlace={selectPlaceOnChart}
          legs={s.legs}
          heldPoint={heldPoint}
          onHoldPoint={holdPoint}
          crossings={crossings}
          directs={mapDirects}
          onProcedureFix={showFix}
          fuelStops={fuelStopPins}
          stopFields={stopFieldPins}
          onPickStopField={pickStopField}
          ways={wayLines}
          wayShown={lineKey === "none" ? "own" : lineKey}
          onPickWay={pickWay}
          routeLegs={mapLegs}
          onSelectLeg={setLegAt}
          selectedLeg={openLeg?.key ?? null}
          routeRows={routeRows}
        />
      </Suspense>
      {/* The next checkpoint over the map in flight (FlyingHead). */}
      {flying && (
        <Suspense fallback={null}>
          <FlyingHead run={dryRunning} rows={routeRows} />
        </Suspense>
      )}
      {/* Kept from its first open on, so it eases out as it closes. */}
      {fixSeen && (
        <Suspense fallback={null}>
          <FixCard open={openFix} onClose={() => setOpenFixAt(null)} onDirect={directTo} onCross={setCrossing} />
        </Suspense>
      )}
      {/* A leg of the course tapped (RouteGl): its Route Leg sheet. */}
      {legSeen && (
        <Suspense fallback={null}>
          <RouteLegCard open={openLeg} onClose={closeLeg} />
        </Suspense>
      )}
      {lessonOpen !== null && (
        <Suspense fallback={null}>
          {/* The lesson's track is turned by the engine (lib/geo's bearingDeg). */}
          <EngineGate>
            <AssignedLesson key={lessonOpen} id={lessonOpen} aircraft={fitAircraft} onClose={closeLesson} />
          </EngineGate>
        </Suspense>
      )}
      <FirstFlight routed={routed} onPlan={setRoute} pickView={vm.view.pickView} setPanel={vm.view.setPanel} />
    </div>
  );
}
