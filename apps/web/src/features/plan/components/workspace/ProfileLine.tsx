import { useQuery } from "@tanstack/react-query";
import { flightLevel, nm } from "../../../../lib/format/figures";
import { duration } from "../../../../lib/format/time";
import { usePastFlight } from "../../map/pastFlight";
import { dryRunFlown } from "../navlog/dryRun";
import { routeProfileQuery } from "../../../../lib/queryClient";
import { clearanceAt } from "../navlog/altitude/clearance";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/**
 * The Profile card's line under its name, in sight at its smallest size
 * too (the owner, 2026-11-11, the canvas's "Cruise FL055 · clear of
 * terrain"): the cruise the plan flies and the engine's verdict on the
 * ground under it (profile_clearance, the side view's own tint): red where
 * the route comes within 500 ft of the ground or an obstacle (14 CFR
 * 91.119(c)), yellow within 1,000 ft (91.119(b)), else clear. The ground
 * is the side view's query, fetched once for both.
 */
export default function ProfileLine({ vm }: { vm: PlanWorkspaceModel }) {
  const { planned, s, dryRunning } = vm;
  const cruise = s.nav?.altitude_ft ?? null;
  const { data: profile } = useQuery(routeProfileQuery(planned.dep, `${planned.dest}`, planned.stops));
  // A dry run playing: where it is, in this line, since the Profile's card
  // covers the sheet's foot where its counting figures are (the owner,
  // 2026-11-11, the canvas's "Leg 2 of 4 · 18m to go"). Read to the tenth
  // of a mile and the minute, so the line is drawn again only when one
  // changes, not at each of the run's frames.
  const run = usePastFlight((p) => {
    if (!dryRunning) return "";
    const flown = dryRunFlown(dryRunning, p.at ?? dryRunning.points[0]?.t ?? 0);
    return flown ? `${flown.hop}|${flown.last.nm.toFixed(1)}|${Math.round(flown.last.min)}` : "";
  });
  if (dryRunning && run) {
    const [hop, leftNm, leftMin] = run.split("|").map(Number) as [number, number, number];
    const legs = dryRunning.landings.length;
    return (
      <>
        {legs > 1 ? `Leg ${hop + 1} of ${legs} · ` : "Dry run · "}
        {nm(leftNm)} · {duration(leftMin)} to go
      </>
    );
  }
  if (cruise === null) return null;
  const level = clearanceAt(profile, cruise)?.level;
  const verdict =
    level === "red"
      ? "terrain within 500 ft"
      : level === "yellow"
        ? "terrain within 1,000 ft"
        : level === "clear"
          ? "clear of terrain"
          : null;
  return (
    <>
      Cruise {flightLevel(cruise)}
      {verdict && ` · ${verdict}`}
    </>
  );
}
