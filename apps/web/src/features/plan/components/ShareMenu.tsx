import { useMemo, useState, type ReactNode } from "react";
import { done } from "../../../lib/doneNote";
import { Ellipsis, FileArchive, FileText, Fuel, Link2, MapPinned, Printer, RotateCw, Send, Share, ListOrdered, Trash2 } from "lucide-react";
import RoundButton from "../../../components/RoundButton";
import { ResponsivePopover, ResponsivePopoverAnchor } from "../../../components/ResponsivePopover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import type { Candidate, Course } from "../../../lib/api/types";
import type { RouteCard } from "../../../lib/openCards";
import { foreflightRoute, type PlanPoint } from "../../../lib/flightPlanFiles";
import { markPackSent, openInForeFlight, packOrigin, packPath, packSent } from "../lib/foreflightPack";
import { navLogRows } from "./navlog/rows";
import { useShareLink } from "../hooks/useShareLink";
import { refreshLive } from "../../../lib/liveRefresh";
import type { RouteEdit } from "../../../lib/preferences";
import ShowRouteAs from "./ShowRouteAs";

const SHARE_LABEL: Record<"route" | RouteCard, string> = {
  // The route box's is More, a "…", at the owner's ask ("Don't call it
  // share, call it more with the … as the text"): it holds the route's
  // other actions (save, file, plan again, clear), not sharing alone.
  route: "More",
  brief: "Share the briefing",
  navlog: "Share the nav log",
  profile: "Share the profile",
};

/** The route as typed: its departure, stops and destination. */
interface Planned {
  dep: string;
  dest: string;
  stops: string[];
}

/**
 * Share, a round button of glass beside the route's Approaches -- at the
 * capsule's start at rest -- and with it, at the pilot's ask, everything
 * else the route's row had: the route shared (a link, a file for another
 * app or the panel's GPS, on an iPhone the share sheet's Open in
 * ForeFlight), Save, the solo cross-country review, filing the flight
 * plan and the route's close. Only once there is a route (PlanWorkspace).
 *
 * Each card's own, at the owner's asks ("every share button needs to be
 * specific to that card. So printing briefing should only be in brief
 * card"; "printing navlog should be in navlog"): the route box's has the
 * route -- its link, files, ForeFlight, Save and the review, filing and its
 * clear; the Brief's, its link, Print the briefing and Refresh; the nav log's, its
 * link and the nav log printed (the kneeboard card); the profile's, its
 * link.
 *
 * Out of the workspace (PlanWorkspace), which only says what the route is
 * and hands in what the lazy route panel draws: Save and the review's item
 * (`saving`), and the review's sheet (`reviewSheet`), opened here as the
 * menu goes.
 */
export default function ShareMenu({
  align,
  testId = "share-route",
  card = "route",
  planned,
  course,
  selected,
  altitudeFt,
  routed,
  local,
  fileable,
  onFile,
  saving,
  reviewSheet,
  planAgain,
  onShowFuel,
  onNavLog,
  onClear,
  showRouteAs,
}: {
  /** How FPL shows its route, the route box's menu's view options (the
   *  owner, 2026-11-13: "I want to move fpl layout to the fpl page"). */
  showRouteAs?: { value: RouteEdit; onChange: (value: RouteEdit) => void };
  /** The suggested fuel stops taken out of the route box, put back. */
  onShowFuel?: () => void;
  /** The route's nav log opened: the route box's, with a course drawn. */
  onNavLog?: () => void;
  /** The route cleared: the route box's menu's last item (the owner,
   *  2026-11-11: "Instead of clear button, move that to the …"). */
  onClear?: () => void;
  align: "start" | "end";
  /** Its button's: the route box's, or the tab bar's over the Brief and
   *  the nav log (TabBar's `routeShare`). */
  testId?: string;
  /** Whose Share it is: the route box's, or one of the route's cards'. */
  card?: "route" | RouteCard;
  planned: Planned;
  course: Course | null;
  selected: Candidate[];
  altitudeFt: number | undefined;
  /** A route planned whole, its nav log in. */
  routed: boolean;
  /** A local flight, round one field: no kneeboard card. */
  local: boolean;
  fileable: boolean;
  onFile: () => void;
  /** Save and the review's item, given the way to open the review's sheet. */
  saving: (askReview: () => void) => ReactNode;
  /** The review's sheet, given the way to put it away. */
  reviewSheet: (done: () => void) => ReactNode;
  /** Plan again -- fresh winds, weather and fuel -- in the route's menu,
   *  at the owner's pick ("A": the route box's row on one line), and what
   *  is out of date, marked on Share as it was on its own button. */
  planAgain?: { stale: string[]; onPlan: () => void };
}) {
  const [askingReview, setAskingReview] = useState(false);
  // What an item does once the menu has gone, at Base UI's own word that
  // its close has finished (onOpenChangeComplete), not after a guessed
  // 150 ms a slow phone ran past: printed, the menu was on the paper.
  const [afterClose, setAfterClose] = useState<{ then: () => void } | null>(null);
  const afterMenu = (then: () => void) => () => setAfterClose({ then });

  // The plan, to another pilot or an instructor, as a link that opens as
  // a preview (useShareLink): the share sheet where the browser has one
  // (Safari on an iPhone), otherwise copied.
  const { share } = useShareLink(planned, altitudeFt);

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

  // The checkpoints as a ForeFlight content pack, built by the planner
  // (features/plan/lib/foreflightPack): each a waypoint with its own page, and the course
  // drawn on its map, for ForeFlight's own link or to download.
  const packHref = selected.length ? packPath(planned.dep, planned.dest, planned.stops) : null;
  // Open in ForeFlight is one button for the two hand-offs ForeFlight
  // needs: the pack first, the first time a route goes there from this
  // device, then the route itself, its checkpoints by their names in the
  // pack (CONTPACK@LAKE_ZURICH) -- ForeFlight takes no route and pack in
  // one. The pilot asked for one step; it is one button, tapped twice the
  // first time and once after.
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

  return (
    // The review's sheet, from the menu's item, placed by the Share
    // button: opened once the menu has gone (afterClose), as Print is.
    <ResponsivePopover
      open={askingReview}
      onOpenChange={(open, details) => {
        // The review's sheet opens as the Share menu goes, whose focus goes
        // back to its button as it closes: taken for a move outside, it
        // shut the sheet just opened, now and then. A tap outside or
        // Escape still closes it.
        if (!open && details?.reason === "focus-out") return details.cancel();
        setAskingReview(open);
      }}
    >
      <DropdownMenu
        onOpenChangeComplete={(open) => {
          if (open || !afterClose) return;
          setAfterClose(null);
          afterClose.then();
        }}
      >
        <ResponsivePopoverAnchor asChild>
          <DropdownMenuTrigger
            render={
              <RoundButton
                label={planAgain?.stale.length ? `${SHARE_LABEL[card]}: ${planAgain.stale.join(", ")}` : SHARE_LABEL[card]}
                className={card === "route" ? "size-[32px]" : undefined}
                data-testid={testId}
              />
            }
          >
            {/* The route box's a size down, as the box's other buttons are. */}

            <span className="relative">
              {card === "route" ? <Ellipsis className="size-[18px]" strokeWidth={2.4} /> : <Share className="size-5" strokeWidth={2} />}
              {!!planAgain?.stale.length && (
                <span
                  aria-hidden="true"
                  data-testid="plan-again-mark"
                  className="absolute -top-0.5 -right-1 size-2 rounded-full bg-caution"
                />
              )}
            </span>
          </DropdownMenuTrigger>
        </ResponsivePopoverAnchor>
        <DropdownMenuContent align={align} className="min-w-56 print:hidden">
          {/* The nav log, its button's place beside the Brief now the
              Profile's (the owner, 2026-11-04: "Navlog can be moved to the
              more button"). */}
          {onNavLog && (
            <DropdownMenuItem onClick={onNavLog} data-testid="route-navlog">
              <ListOrdered />
              Nav log
            </DropdownMenuItem>
          )}
          {routed && onShowFuel && (
            <DropdownMenuItem onClick={onShowFuel} data-testid="route-show-fuel">
              <Fuel />
              Show Fuel Stops
            </DropdownMenuItem>
          )}
          {routed && (
            <DropdownMenuItem onClick={() => void share()} data-testid="share-link">
              <Link2 />
              Share link
            </DropdownMenuItem>
          )}
          {card === "route" && (
            <>
              {routed && (
                <>
                  {/* ForeFlight sends the route on to the panel wirelessly
                      (Garmin's Connext, Avidyne, Dynon): the owner's pick
                      (2026-11-02), as most pilots have ForeFlight and not
                      Garmin Pilot, and no files for an SD card or a USB stick. */}
                  {/* Links, not handlers: ForeFlight opens from a tap on its
                      own link, and a download needs one too. */}
                  {points.length > 0 &&
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
                  {/* Sent once and since deleted in ForeFlight: again. */}
                  {packHref && sentPack && (
                    <DropdownMenuItem
                      data-testid="foreflight-pack"
                      render={
                        <a href={openInForeFlight(new URL(packHref, packOrigin(window.location)).href)}>
                          <MapPinned />
                          Send the checkpoints again
                        </a>
                      }
                    />
                  )}
                  {packHref && (
                    <DropdownMenuItem
                      data-testid="export-foreflight"
                      render={
                        <a href={packHref} download>
                          <FileArchive />
                          Checkpoints for ForeFlight (.zip)
                        </a>
                      }
                    />
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              {/* Before there is a route, only what applies then: the
                  route's Show Route As (the owner, 2026-11-13), the rest
                  left out, not greyed. */}
              {routed && saving(afterMenu(() => setAskingReview(true)))}
              {routed && (
                <DropdownMenuItem disabled={!fileable} onClick={onFile} data-testid="file-flight-plan">
                  <FileText />
                  File flight plan
                </DropdownMenuItem>
              )}
              {planAgain && (
                <DropdownMenuItem onClick={planAgain.onPlan} data-testid="plan-again" data-stale={planAgain.stale.length ? "" : undefined}>
                  <RotateCw />
                  Refresh
                  {planAgain.stale.length > 0 && <span aria-hidden="true" className="ml-auto size-2 rounded-full bg-caution" />}
                </DropdownMenuItem>
              )}
            </>
          )}
          {/* Printed once the menu has gone, so it is not on the paper: the
              whole briefing from the Brief, and from the nav log the
              kneeboard card -- the nav log, radio and patterns on one
              half-letter page to fly with. */}
          {card === "brief" && (
            <DropdownMenuItem disabled={!routed} onClick={afterMenu(() => window.print())} data-testid="print-briefing">
              <Printer />
              Print the briefing
            </DropdownMenuItem>
          )}
          {/* The Brief's live reports asked again now, as the route's
              Refresh is in its own menu: the head keeps its two buttons
              (rules.md). Kept fresh by themselves besides (useLiveRefresh). */}
          {card === "brief" && (
            <DropdownMenuItem onClick={() => void refreshLive("brief")} data-testid="brief-refresh">
              <RotateCw />
              Refresh
            </DropdownMenuItem>
          )}
          {card === "navlog" && !local && (
            <DropdownMenuItem
              disabled={!routed}
              data-testid="print-kneeboard"
              onClick={afterMenu(() => void import("../lib/printKneeboard").then((m) => m.printKneeboard()))}
            >
              <Printer />
              Print the nav log
            </DropdownMenuItem>
          )}
          {/* The page's view options after its actions, as iOS's ••• menus
              put them, the Clear still last. */}
          {showRouteAs && (
            <>
              {/* A band after the route's actions; none over it alone. */}
              {routed && <DropdownMenuSeparator />}
              <ShowRouteAs {...showRouteAs} />
            </>
          )}
          {onClear && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onClear} data-testid="route-clear">
                <Trash2 />
                Clear route
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {askingReview && reviewSheet(() => setAskingReview(false))}
    </ResponsivePopover>
  );
}
