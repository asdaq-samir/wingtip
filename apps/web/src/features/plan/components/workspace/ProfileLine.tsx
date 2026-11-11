import { useQuery } from "@tanstack/react-query";
import { flightLevel } from "../../../../lib/format/figures";
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
  const { planned, s } = vm;
  const cruise = s.nav?.altitude_ft ?? null;
  const { data: profile } = useQuery(routeProfileQuery(planned.dep, `${planned.dest}`, planned.stops));
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
