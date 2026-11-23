import type { ComponentProps, ReactNode } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { useVerdict } from "../../../lib/verdict";
import { findingRows } from "../vm/planWords";
import { FloatingBar, FloatingBarButton, TabCount } from "../../../components/FloatingBar";
import { ICON } from "../../../lib/icons";
import type { PlanSlices } from "../vm/planSlices";
import { EDGE_ROOM } from "../../../components/sheet/insets";
import { FLOATING_BAR_ROOM, FLOATING_BAR_SHEET_ROOM } from "../../../components/floatingBarLook";
import { cn } from "cn";

/**
 * FPL's actions as a floating glass bar at the sheet's foot (the owner,
 * 2026-11-16: "make those action buttons as tab bar again and move the
 * calculations strip to where the action buttons are now"): Brief and Nav
 * Log, each its 24-point glyph over its word in one capsule, the one
 * floating bar the airport card's tabs are drawn in too (FloatingBar, the
 * same height; the owner, 2026-11-18), but buttons, not tabs:
 * each opens its card over FPL as the tiles did (the owner's pick, "Bar
 * look, open cards"), and last the route's one menu, ••• "More" (`more`,
 * ShareMenu's bar look; the owner, 2026-11-17: "move everything to the tab
 * bar with a ... instead of share"), which holds only Route Options, Share
 * link and Open in ForeFlight (RouteMore, the owner, 2026-11-21), File its
 * own button beside the bar.
 * From half up, under the figures; at the pill the figures alone, large (FlightFoot).
 * What the Brief found to act on is counted on its glyph's corner, red
 * where one is a stop, amber where all are cautions (CardTabBar's
 * FloatingBar's TabCount, the one badge, each colour one meaning): the findings themselves
 * are the Brief's, which opens with them (the owner, 2026-11-16: "isn't
 * there a better place for them? Like brief"), not a list on FPL, and
 * said in its name. The Profile is the altitude pill's own button now, its
 * caution counted there (ProfilePillButton; the owner, 2026-11-20: "can FL
 * show profile button rather than in the tab bar?").
 *
 * The capsule is Base UI's stock Toolbar (the owner, 2026-11-17: stock
 * parts where they avoid bugs): one tab stop, the arrows between its
 * buttons (the APG toolbar), as the playback bars are (PlaybackBar), and
 * each button a Toolbar.Button rendering a FloatingBarButton, the ••• the
 * route's menu's trigger rendering one (ShareMenu's `look="bar"`).
 */
export function FplTabBar({
  vm,
  more,
  fileable = false,
  onFile,
  routes,
}: {
  vm: PlanSlices<"brief" | "fpl" | "plan">;
  more: ReactNode;
  fileable?: boolean;
  onFile?: () => void;
  /** The suggested routes out above the route and on the map, or put
   *  away; greyed while there are no ways to offer (routesOffered). */
  routes?: RouteOptions;
}) {
  const { course } = vm.plan;
  const { openBrief, openNavLogCard } = vm.fpl;
  const { briefMark } = vm.brief;
  const found = findingRows(useVerdict((v) => v.items)).length;
  return (
    // Glass, as the airport card's bar is (CardTabBar; the owner,
    // 2026-11-18: "Is it different then airport card?"), on the foot's own
    // solid ground now, the figures over it, so no route runs under it and
    // nothing behind it is dimmed. Across the sheet's whole width, out over the foot's 16-point
    // sides (SheetParts' px-4); only the capsule takes taps. Under the
    // figures in FPL's foot, one stack (FlightFoot's GroundFoot; on a phone
    // the fixed bar beside the sheet, sheet/FootBar), folded away at the
    // pill.
    // Its room under it the floating bar's (FLOATING_BAR_SHEET_ROOM), in
    // place of the sheet's 8-point edge (EDGE_ROOM) under the foot: the
    // margin takes back the difference, 4 points with no home indicator.
    <div
      className={cn("pointer-events-none -mx-4 flex justify-center gap-2 px-4 pt-2", FLOATING_BAR_ROOM)}
      style={{ marginBottom: `calc(${FLOATING_BAR_SHEET_ROOM} - ${EDGE_ROOM})` }}
      data-testid="fpl-actions"
    >
      {/* The one floating bar's capsule (FloatingBar), the airport
          card's too: glass only on what floats (rules.md). As wide as its
          buttons and centred, as the airport card's is, not stretched
          across the sheet, which spread its buttons further apart than
          the card's tabs (the owner, 2026-11-20: "How come fpl tab bar is
          more spaced out then airport one?"). Its own classes the card's
          but the taps: a min-w-0 here overrode the bar's least width and
          drew FPL's items 62 to the card's 73 (the owner, 2026-11-21: "fpl
          and other tabs placement look different"). */}
      <Toolbar.Root aria-label="Route" render={<FloatingBar className="pointer-events-auto shrink-0" />}>
        <BarAction
          icon={<ICON.brief />}
          badge={briefMark && found > 0 && <TabCount count={found} mark={briefMark} testId="route-brief-count" />}
          label="Brief"
          spoken={briefMark && found > 0 ? `Brief, ${found} ${found === 1 ? "finding" : "findings"} to look at` : undefined}
          onClick={openBrief}
          // Nothing to brief while a point of the route is not known, as
          // the Nav Log and the Profile have nothing (the UI audit's B8).
          disabled={!!vm.plan.s.unknownPlace}
          testId="route-brief"
          data-finding={briefMark ?? undefined}
        />
        <BarAction icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
        {/* Route Options, a tab of the bar's own beside Nav Log, in the
            route glyph FPL's button had before it read "FPL" (the owner,
            2026-11-22: "route option can show in the tab bar instead with
            the previous fpl icon we used"), where it was More's first item;
            pressed while the suggested routes are out. */}
        {/* Always there, so the bar never shifts; greyed, and named why,
            with no ways to suggest (the owner, 2026-11-22: "Routes should
            always show in the tab bar, just disabled if no routes"). */}
        {routes && (
          <BarAction
            icon={<ICON.flightPlan />}
            label="Routes"
            // Its name starts with its word, "Routes" (WCAG 2.5.3, Label in
            // Name): "Route Options" and "No route options" did not hold it.
            spoken={routes.offered ? "Routes, route options" : "Routes, no route options"}
            aria-pressed={routes.offered && routes.shown}
            disabled={!routes.offered}
            onClick={() => routes.onShown(!routes.shown)}
            testId="routes-toggle"
          />
        )}
        {more}
      </Toolbar.Root>
      {/* File flight plan, a button of its own beside the bar (the owner,
          2026-11-21: "File flight plan should be a separate button next to
          tabs"), in the bar's glass and height, its glyph over its word as
          the bar's items; the pair centred together. It was More's item;
          greyed as it was where the plan cannot be filed (no airport to
          leave from, no log). Out of the bar's own measure (data-single). */}
      {onFile && (
        <FloatingBar data-single="" className="pointer-events-auto shrink-0">
          <FloatingBarButton
            icon={<ICON.file />}
            label="File"
            spoken="File flight plan"
            onClick={onFile}
            disabled={!fileable}
            testId="file-flight-plan"
          />
        </FloatingBar>
      )}
    </div>
  );
}

/** One of the bar's buttons: a Toolbar.Button drawn as the bar's
 *  FloatingBarButton, which takes the button's ref, keys and roving tab
 *  stop. A greyed one is left out of the arrows' way, as a native disabled
 *  button is out of the Tab key's (focusableWhenDisabled off). */
function BarAction({ disabled, ...action }: ComponentProps<typeof FloatingBarButton>) {
  return <Toolbar.Button disabled={disabled} focusableWhenDisabled={false} render={<FloatingBarButton {...action} />} />;
}

/** The suggested routes' switch (useRouteList's routesShown). */
export interface RouteOptions {
  /** Whether there are ways to suggest (routesOffered): greyed without. */
  offered: boolean;
  shown: boolean;
  onShown: (shown: boolean) => void;
}
