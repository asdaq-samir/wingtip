import { Suspense, lazy } from "react";
import { Play } from "lucide-react";
import IconButton from "../../../components/IconButton";
import { AltitudeProfile, RouteProblem } from "../routePanelParts";
import { useQuery } from "@tanstack/react-query";
import type { PlanSlices } from "../vm/planSlices";
import { aircraftProfilesQuery } from "../../../lib/queryClient";
import { bookOf, ownOf } from "../../../lib/airplane/figures";
import { loadMiniProfile } from "../../navlog";

// The route from the side, drawn only in the Profile's card: out of the
// first load as the lists are.
const MiniProfile = lazy(() => loadMiniProfile());

/** The Profile card's body (AltitudeProfile): the side view with the
 *  altitude's wheel in its corner, its dry run at its top right, and under
 *  it the altitude's figures, Class B and why. */
export default function ProfileSideView({ vm }: { vm: PlanSlices<"brief" | "flight" | "fpl" | "plan" | "route" | "routeList"> }) {
  const { flyAltitude, local, planned, routePoints, routed, setPointAltitude, setStops } = vm.route;
  const { aircraft, changeAltitudeChoice, course, s, selected } = vm.plan;
  const { typeStopAt, waypointStops } = vm.routeList;
  const { closeProfileCard } = vm.fpl;
  const { dryRunReady, dryRunning, startDryRun } = vm.flight;
  const { tightLeg, unflyable } = vm.brief;
  // The airplane as the engine reads it, for a leg's climb or descent
  // (altitude_change): its type's book figures with the pilot's own over
  // them; none picked, none.
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const book = aircraft.none ? null : bookOf(aircraft.profile, profiles);
  const airplaneProfile = book ? { ...book, ...ownOf(aircraft) } : null;
  if (!routed || !course || local) return null;
  return (
    <Suspense fallback={<div className="h-56" />}>
      <AltitudeProfile
        nav={s.nav}
        legs={s.legs}
        winds={s.totals?.winds}
        ends={course}
        chart={(view) => (
          <Suspense fallback={null}>
            <MiniProfile ends={course} selected={selected} legs={s.legs} {...view} ruler />
          </Suspense>
        )}
        corner={
          <IconButton
            round
            label="Dry run"
            onClick={startDryRun}
            disabled={!dryRunReady}
            className="absolute top-1.5 right-1.5"
            data-testid="dry-run-start"
          >
            <Play className="size-5" />
          </IconButton>
        }
        wheelHidden={!!dryRunning}
        problem={
          unflyable ? (
            <RouteProblem
              problem={unflyable}
              onAddStop={() => {
                closeProfileCard();
                // The route opened, the field asked for a stop before the
                // destination (useRouteListEdit's typeStopAt).
                typeStopAt(routePoints.length - 1);
              }}
              onGoRound={(via, at) => {
                closeProfileCard();
                setStops([...planned.stops.slice(0, at), ...via, ...planned.stops.slice(at)]);
              }}
            />
          ) : undefined
        }
        tight={unflyable ? null : tightLeg}
        onGoRound={(via, at) => {
          closeProfileCard();
          setStops([...planned.stops.slice(0, at), ...via, ...planned.stops.slice(at)]);
        }}
        onAltitudeChoiceChange={changeAltitudeChoice}
        onFlyAltitude={flyAltitude}
        routePoints={routePoints}
        waypoints={waypointStops}
        airplaneProfile={airplaneProfile}
        onLegAltitude={setPointAltitude}
      />
    </Suspense>
  );
}
