import { useQuery } from "@tanstack/react-query";
import { altFt, wholeNm } from "../../../lib/format/figures";
import { duration } from "../../../lib/format/time";
import { usePastFlight, dryRunFlown } from "../../plan";
import { routeProfileQuery } from "../../../lib/queryClient";
import { clearanceAt } from "../../navlog";
import type { PlanSlices } from "../vm/planSlices";

/**
 * The Profile card's line under its name, in sight at its smallest size
 * too: what the side view does not say in words -- by how much the cruise
 * clears the ground and the obstacles under the route, the engine's least
 * room (profile_clearance's `least_ft`, the side view's own tint: red
 * within 500 ft of them, 14 CFR 91.119(c), yellow within 1,000 ft,
 * 91.119(b)). The cruise itself is not said again: it is the side view's
 * tag and FPL's altitude, beside it (the owner's list, 2026-11-17, where it
 * read "Cruise FL-145 · clear of terrain"). The ground is the side view's
 * query, fetched once for both.
 */
export default function ProfileLine({ vm }: { vm: PlanSlices<"flight" | "plan" | "route"> }) {
  const { planned } = vm.route;
  const { s } = vm.plan;
  const { dryRunning } = vm.flight;
  const cruise = s.nav?.altitude_ft ?? null;
  const { data: profile } = useQuery(routeProfileQuery(planned.dep, `${planned.dest}`, planned.stops));
  // A dry run playing: where it is, in this line, since the Profile's card
  // covers the sheet's foot where its counting figures are (the owner,
  // 2026-11-11, the canvas's "Leg 2 of 4 · 18m to go"). Read to the whole
  // mile and the minute, as it is written, so the line is drawn again only when one
  // changes, not at each of the run's frames.
  const run = usePastFlight((p) => {
    if (!dryRunning) return "";
    const flown = dryRunFlown(dryRunning, p.at ?? dryRunning.points[0]?.t ?? 0);
    return flown ? `${flown.hop}|${Math.round(flown.last.nm)}|${Math.round(flown.last.min)}` : "";
  });
  if (dryRunning && run) {
    const [hop, leftNm, leftMin] = run.split("|").map(Number) as [number, number, number];
    const legs = dryRunning.landings.length;
    return (
      <>
        {legs > 1 ? `Leg ${hop + 1} of ${legs} · ` : "Dry run · "}
        {wholeNm(leftNm)} · {duration(leftMin)} to go
      </>
    );
  }
  if (cruise === null) return null;
  const least = clearanceAt(profile, cruise)?.least_ft;
  if (least == null) return null;
  return <>{least >= 0 ? `Clears terrain by ${altFt(least)} ft` : `${altFt(-least)} ft below terrain`}</>;
}
