import { useMemo } from "react";
import { Send, Signpost } from "lucide-react";
import { DropdownMenuCheckboxItem, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { foreflightRoute, type PlanPoint } from "../../lib/flightPlanFiles";
import { openInForeFlight, packOrigin } from "./foreflightPack";
import { navLogRows } from "../plan";
import { ShareMenuShell, type ShellLook } from "./ShareMenuShell";
import { ShareLinkItem, type SharedRoute } from "./shareItems";
import { usePack } from "./usePack";

/**
 * The route's ••• (More): Route Options, the route's link and Open in
 * ForeFlight (the owner, 2026-11-21: More keeps only Route Options, Share
 * link and Open in ForeFlight). Save and the review are the Brief's
 * (BriefShare), the checkpoints and the printed nav log the nav log's
 * (NavLogShare), and File its own button beside the bar (FplTabBar).
 */
export function RouteMore({
  route,
  routeOptions,
  ...look
}: ShellLook & {
  route: SharedRoute;
  /** The suggested routes out above the route and on the map, or put
   *  away: More's first item (the owner, 2026-11-19: "Let's put the more
   *  route options in the ... button"), where it was a pill under FPL's
   *  title; given only while there are ways to offer (routesOffered). */
  routeOptions?: { shown: boolean; onShown: (shown: boolean) => void };
}) {
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
  // With Route Options' checkmark column in the menu, every item's glyph and
  // words start where its do, as an iOS menu lines up its titles with a
  // ticked one's: Share link and Open in ForeFlight sat about 30 points
  // further out (the HIG review, 2026-11-21).
  const inset = !!routeOptions;

  return (
    <ShareMenuShell card="route" {...look}>
      {() => (
        <>
          {routeOptions && (
            <DropdownMenuCheckboxItem checked={routeOptions.shown} onCheckedChange={routeOptions.onShown} data-testid="routes-toggle">
              <Signpost />
              Route Options
            </DropdownMenuCheckboxItem>
          )}
          <ShareLinkItem route={route} inset={inset} />
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
                inset={inset}
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
                inset={inset}
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
