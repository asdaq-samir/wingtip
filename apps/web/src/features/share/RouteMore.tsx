import { useMemo } from "react";
import { Send } from "lucide-react";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { foreflightRoute, type PlanPoint } from "../../lib/flightPlanFiles";
import { openInForeFlight, packOrigin } from "./foreflightPack";
import { navLogRows } from "../plan";
import { ShareMenuShell, type ShellLook } from "./ShareMenuShell";
import { ShareLinkItem, type SharedRoute } from "./shareItems";
import { usePack } from "./usePack";

/**
 * The route's ••• (More): the route's link and Open in ForeFlight (the
 * owner, 2026-11-22: Route Options a tab of FPL's bar, FplTabBar). Save and the review are the Brief's
 * (BriefShare), the checkpoints and the printed nav log the nav log's
 * (NavLogShare), and File its own button beside the bar (FplTabBar).
 */
export function RouteMore({ route, ...look }: ShellLook & { route: SharedRoute }) {
  const { course, selected, altitudeFt } = route;
  // The route as the files and ForeFlight's link take it: the departure,
  // each checkpoint, stop and the destination, as the nav log lists them
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
  const { packHref, sentPack, sendPack } = usePack(route);

  return (
    <ShareMenuShell card="route" {...look}>
      {() => (
        <>
          <ShareLinkItem route={route} />
          {/* ForeFlight sends the route on to the panel wirelessly
              (Garmin's Connext, Avidyne, Dynon): the owner's pick
              (2026-11-02), as most pilots have ForeFlight and not
              Garmin Pilot, and no files for an SD card or a USB stick. */}
          {/* Links, not handlers: ForeFlight opens from a tap on its
              own link, and a download needs one too. */}
          {route.routed &&
            points.length > 0 &&
            (packHref && !sentPack ? (
              <DropdownMenuItem
                data-testid="open-foreflight"
                render={
                  <a href={openInForeFlight(new URL(packHref, packOrigin(window.location)).href)} onClick={sendPack}>
                    <Send />
                    Open in ForeFlight
                  </a>
                }
              />
            ) : (
              <DropdownMenuItem
                data-testid="open-foreflight"
                render={
                  <a href={foreflightRoute(points, altitudeFt, sentPack)}>
                    <Send />
                    Open in ForeFlight
                  </a>
                }
              />
            ))}
        </>
      )}
    </ShareMenuShell>
  );
}
