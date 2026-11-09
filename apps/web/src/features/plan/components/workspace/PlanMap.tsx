import { Suspense, lazy } from "react";
import { cn } from "cn";
import { RouteMap } from "../../routeMapChunk";
import TipHost from "../../../../components/TipHost";
import FirstFlight from "../FirstFlight";
import FixCard from "../FixCard";
import RouteLegCard from "../RouteLegCard";
import { FlyingHead } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/** An approach the pilot's instructor set them, opened from their
 *  Checkride page (`?lesson=12`): its own chunk, as the lesson's is. */
const AssignedLesson = lazy(() => import("../AssignedLesson"));

/** The map beside the briefing (PlanWorkspace's `map`), with what floats
 *  over it: the next checkpoint in flight, a fix's card, an assigned
 *  approach, the tips and the first flight's. */
export default function PlanMap({ vm }: { vm: PlanWorkspaceModel }) {
  const {
    closeLeg, closeLesson, course, crossings, directTo, dryRunning, fitAircraft, flownPatterns, flying, fuelStopPins, heldPoint, holdPoint,
    lessonOpen, lineKey, mapDirects, mapLegs, mapProcedures, nearOpen, openLeg, nearestPoints, openFix, openNavLogCard, panelOpen, patternFocus, pickPoint,
    pickStopField, pickWay, placePin, procedureCover, procedureFocus, routeRows, routed, s, selectCandidate, selectPlaceOnChart, selected,
    selectedPoint, setCrossing, setLegAt, setOpenFixAt, setRoute, showFix, startPin, stopFieldPins, wayLines,
  } = vm;
  return (
    <div className={cn("h-full w-full", panelOpen && "print:hidden")}>
      {/* Its own boundary: the map's chunk (routeMapChunk) comes after the
          panel's first script, and without one the page's (MapPage)
          held the panel back, blank, until it had. */}
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
        procedureCover={procedureCover}
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
        fuelStops={fuelStopPins} stopFields={stopFieldPins} onPickStopField={pickStopField}
        ways={wayLines} wayShown={lineKey === "none" ? "own" : lineKey} onPickWay={pickWay}
        routeLegs={mapLegs} onSelectLeg={setLegAt} selectedLeg={openLeg?.key ?? null}
        routeRows={routeRows}
      />
      </Suspense>
      {/* The next checkpoint over the map in flight (FlyingHead). */}
      {flying && <Suspense fallback={null}><FlyingHead run={dryRunning} rows={routeRows} /></Suspense>}
      <FixCard open={openFix} onClose={() => setOpenFixAt(null)} onDirect={directTo} onCross={setCrossing} />
      {/* A leg of the course tapped (RouteGl): its Route Leg sheet. */}
      <RouteLegCard open={openLeg} onClose={closeLeg} />
      {lessonOpen !== null && (
        <Suspense fallback={null}>
          <AssignedLesson key={lessonOpen} id={lessonOpen} aircraft={fitAircraft} onClose={closeLesson} />
        </Suspense>
      )}
      {/* What to look for, a tip at a time, the first times (lib/firstRunTips). */}
      <TipHost />
      <FirstFlight routed={routed} onPlan={setRoute} onPlanned={openNavLogCard} />
    </div>
  );
}
