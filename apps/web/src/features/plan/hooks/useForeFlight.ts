import { useMemo, useState } from "react";
import { done } from "../../../lib/doneNote";
import type { Candidate, Course } from "../../../lib/api/types";
import { foreflightRoute, type PlanPoint } from "../../../lib/flightPlanFiles";
import { markPackSent, openInForeFlight, packOrigin, packPath, packSent } from "../lib/foreflightPack";
import { navLogRows } from "../components/navlog/rows";

/** A link to follow, and what its tap does besides. */
interface ForeFlightLink {
  href: string;
  onClick?: () => void;
}

/**
 * The route to ForeFlight, which sends it on to the panel wirelessly
 * (Garmin's Connext, Avidyne, Dynon): the owner's pick (2026-11-02), as most
 * pilots have ForeFlight and not Garmin Pilot. Links, not handlers:
 * ForeFlight opens from a tap on its own link, and a download needs one too.
 * FPL's tab bar's ForeFlight (FplTabBar) opens it; the route's ••• menu
 * (ShareMenu) keeps the checkpoints sent again and their .zip.
 *
 * - `open`: Open in ForeFlight, one link for the two hand-offs ForeFlight
 *   needs: the checkpoints' pack first, the first time a route goes there
 *   from this device, then the route itself, its checkpoints by their
 *   names in the pack (CONTPACK@LAKE_ZURICH) -- ForeFlight takes no route
 *   and pack in one. The pilot asked for one step; it is one button, tapped
 *   twice the first time and once after. None with no point to send.
 * - `again`: the pack sent once and since deleted in ForeFlight, again.
 * - `zip`: the pack to download.
 */
export function useForeFlight(
  planned: { dep: string; dest: string; stops: string[] },
  course: Course | null,
  selected: Candidate[],
  altitudeFt: number | undefined,
): { open: ForeFlightLink | null; again: string | null; zip: string | null } {
  // The route as ForeFlight's link takes it: the departure, each
  // checkpoint, stop and the destination, as the nav log lists them
  // (lib/flightPlanFiles).
  const points = useMemo(
    (): PlanPoint[] =>
      !course
        ? []
        : navLogRows(course, selected, []).flatMap((row): PlanPoint[] => {
            if (row.kind === "checkpoint")
              return [
                {
                  ident: "",
                  name: row.cp.name || row.cp.category,
                  kind: "checkpoint",
                  lat: row.cp.lat,
                  lon: row.cp.lon,
                  waypoint: row.cp.waypoint,
                },
              ];
            if (row.kind === "toc" || row.kind === "tod") return [];
            return [
              {
                ident: row.airport.ident,
                name: row.airport.name ?? row.airport.ident,
                kind: row.airport.kind === "fix" ? "fix" : "airport",
                lat: row.airport.lat,
                lon: row.airport.lon,
              },
            ];
          }),
    [course, selected],
  );
  // The checkpoints as a ForeFlight content pack, built by the planner
  // (features/plan/lib/foreflightPack): each a waypoint with its own page,
  // and the course drawn on its map.
  const zip = selected.length ? packPath(planned.dep, planned.dest, planned.stops) : null;
  const packRoute = [planned.dep, ...planned.stops, planned.dest].join("-");
  const packNames = selected.map((c) => c.waypoint ?? "");
  const [, packChanged] = useState(0);
  const sent = zip !== null && packSent(packRoute, packNames);
  const packLink = zip && openInForeFlight(new URL(zip, packOrigin(window.location)).href);
  const sendPack = () => {
    markPackSent(packRoute, packNames);
    // The link changes after the tap has followed it: changed at once, the
    // tap followed the new one, the route's.
    window.setTimeout(() => packChanged((n) => n + 1), 0);
    done("Sent to ForeFlight", { detail: "Then tap Open in ForeFlight again" });
  };
  const open =
    points.length === 0
      ? null
      : packLink && !sent
        ? { href: packLink, onClick: sendPack }
        : { href: foreflightRoute(points, altitudeFt, sent) };
  return { open, again: sent ? packLink : null, zip };
}
