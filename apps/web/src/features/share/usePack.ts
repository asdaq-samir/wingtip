import { useState } from "react";
import { done } from "../../lib/doneNote";
import { markPackSent, packPath, packSent } from "./foreflightPack";
import type { SharedRoute } from "./shareItems";

/**
 * The checkpoints as a ForeFlight content pack, built by the planner
 * (features/share/foreflightPack): each a waypoint with its own page, and the course
 * drawn on its map, for ForeFlight's own link or to download.
 * Open in ForeFlight is one button for the two hand-offs ForeFlight
 * needs: the pack first, the first time a route goes there from this
 * device, then the route itself, its checkpoints by their names in the
 * pack (CONTPACK@LAKE_ZURICH) -- ForeFlight takes no route and pack in
 * one. The pilot asked for one step; it is one button, tapped twice the
 * first time and once after.
 */
export function usePack({ planned, selected }: Pick<SharedRoute, "planned" | "selected">) {
  const packHref = selected.length ? packPath(planned.dep, planned.dest, planned.stops) : null;
  const packRoute = [planned.dep, ...planned.stops, planned.dest].join("-");
  const packNames = selected.map((c) => c.waypoint ?? "");
  const [, packChanged] = useState(0);
  const sentPack = packHref !== null && packSent(packRoute, packNames);
  const sendPack = () => {
    markPackSent(packRoute, packNames);
    // The button's own link changes after the tap has followed it: changed
    // at once, the tap followed the new one, the route's.
    window.setTimeout(() => packChanged((n) => n + 1), 0);
    done("Sent to ForeFlight", { detail: "Then tap Open in ForeFlight again" });
  };
  return { packHref, sentPack, sendPack };
}
