import { Suspense, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { EDGE_ROOM } from "../../../components/sheet/insets";
import { FOOT_BAR_PILL } from "../../../components/sheet/FootBar";
import { useFootRest } from "../../../components/sheet/sheetMotion";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { EngineGate } from "../../../lib/engine/engineGate";
import { TEXT } from "../../../lib/text";
import { TripFigures } from "../../navlog";
import { DirectStrip } from "../../route";
import { DryRunFigures, RouteLine } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { FplTabBar, type RouteOptions } from "./FplTabBar";
import { figuresAway, routesOut } from "./routeEditing";

/** The flight's figures (TripFigures, on the one FigureStrip) in every
 *  state, and over them a Direct to's strip: on the ground FPL's foot over
 *  its tab bar, and its pill (GroundFoot); at the foot (`foot`), large
 *  (`grow`), a dry run's while it plays (DryRunFigures, counting down from
 *  where the airplane is) and in flight the flight's. The figures ask the
 *  engine as they draw (figures.ts' strip_fuel), so they wait for its
 *  .wasm (EngineGate), the rest of the page not (the owner's iPhone,
 *  2026-11-11: "Part of the app didn't load" on "strip_fuel cannot be
 *  worked out"). */
export function FlightFigures({
  vm,
  grow,
  foot = false,
  thin = false,
  pill = false,
}: {
  vm: PlanSlices<"brief" | "flight" | "plan" | "route" | "stops">;
  grow: boolean;
  foot?: boolean;
  /** One thin line (TripFigures' `thin`). */
  thin?: boolean;
  /** The pill's one row (TripFigures' `pill`). */
  pill?: boolean;
}) {
  const { depart, directParam, planned } = vm.route;
  const { directToPoint, s } = vm.plan;
  const { dryRunning, flying } = vm.flight;
  const { estimate } = vm.brief;
  const line = { totals: s.totals, estimate, destination: `${planned.dest}`, depart, local: s.local, flying };
  if (foot && dryRunning)
    return (
      <EngineGate>
        <Suspense fallback={null}>
          <DryRunFigures run={dryRunning} {...line} />
        </Suspense>
      </EngineGate>
    );
  return (
    <EngineGate>
      {/* Flown direct to a point: said over the figures, and Cancel. Put
          away in the pill, whose one row is the figures. */}
      {directParam && (
        <div data-pill-hides="">
          <DirectStrip ident={directParam} onDevice={s.directOnDevice} onCancel={() => directToPoint(null)} />
        </div>
      )}
      <div data-testid="flight-line">
        <TripFigures
          {...line}
          grow={grow}
          thin={thin}
          pill={pill}
          unknown={s.unknownPlace}
          legCourseDeg={s.legs[0]?.magnetic_course_deg ?? null}
        />
      </div>
    </EngineGate>
  );
}

/** What is pinned at FPL's foot (PlanWorkspace's `foot`): the dry run's
 *  figures while it plays; in flight the flight's figures and Done flying;
 *  on the ground the figures over the actions' floating bar (GroundFoot). */
export default function FlightFoot({
  vm,
  more,
  fileable = false,
  onFile,
  routes,
}: {
  vm: PlanSlices<"brief" | "flight" | "fpl" | "plan" | "route" | "routeList" | "stops">;
  /** FPL's own foot, where the ground's floating bar sits (FplTabBar), and
   *  the route's ••• that ends it. */
  more?: ReactNode;
  /** Filing the flight plan, FplTabBar's File button. */
  fileable?: boolean;
  onFile?: () => void;
  /** The suggested routes out or put away, FplTabBar's Routes. */
  routes?: RouteOptions;
}) {
  const { doneFlying, dryRunning, flying } = vm.flight;
  // In flight, the one way out of flying mode (useFlyingMode): a small
  // Done flying at the figures' foot, as the canvas has the line there;
  // the tabs come back on the ground by themselves. Its words stay small,
  // but its target is the whole Flying row, 60 points tall, as every
  // other control in flight is (FLYING_STACK; the owner's Q3,
  // 2026-11-21): the row holds the area (relative), the link not, so its
  // pseudo-element spans the row and nothing grows.
  const doneFlyingRow = flying && (
    <div className={cn("relative flex items-center justify-between pt-1 text-foreground/65", TEXT.note)}>
      <span>Flying</span>
      <Button
        variant="link"
        size="inline"
        className="static font-semibold after:absolute after:inset-x-0 after:top-1/2 after:h-[60px] after:-translate-y-1/2"
        data-testid="done-flying"
        onClick={doneFlying}
      >
        Done Flying
      </Button>
    </div>
  );
  // On the ground, on FPL's page (not at the Profile card's foot, no
  // `more`), the figures over the actions' bar.
  if (more && !dryRunning && !flying) return <GroundFoot vm={vm} more={more} fileable={fileable} onFile={onFile} routes={routes} />;
  return (
    <div className="flex min-h-0 w-full flex-col">
      <FlightFigures vm={vm} grow foot />
      {doneFlyingRow}
    </div>
  );
}

/** The tab bar's capsule's width, px, set on the foot as --tabs-width for
 *  the thin strip over it (GroundFoot), as it is laid out: the capsule is
 *  as wide as its items, which its own room and the reader's text size
 *  set (floatingBarLook), so it is read, not worked out. Found by the mark
 *  the capsule sets on itself (FloatingBar's data-floating-bar), the one
 *  in the foot. CSS alone cannot share it: the tab bar spans the foot and
 *  centres the capsule in it. */
function useTabsWidth() {
  const foot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = foot.current;
    const bar = el?.querySelector<HTMLElement>("[data-floating-bar]");
    if (!el || !bar || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      const width = bar.getBoundingClientRect().width;
      if (width > 0) el.style.setProperty("--tabs-width", `${Math.round(width)}px`);
    });
    watch.observe(bar);
    return () => watch.disconnect();
  }, []);
  return foot;
}

/**
 * FPL's foot on the ground: the figures strip on its tab bar, one stack
 * (iOS 26's tab bar with its bottom accessory), on a phone the fixed bar
 * beside the sliding sheet (sheet/FootBar), beside the side panel its foot.
 * Always the figures, the owner's rule (2026-11-16: "calculations should
 * sit at the bottom ... and then just stay there"); what they look like is
 * the size the sheet is going to (useFootRest), changed once as a drag
 * is let go or a tap sets it, never with the finger: at the pill the figures alone at the pill's size, the tabs folded
 * away; at half and all the way up the thin line (the owner, 2026-11-22:
 * "make the figures strip very thin when fpl is half or full") over the
 * tabs. The tabs are kept laid out while folded, not built again at each
 * rest: React built the bar afresh (its toolbar, its menu, its two panes
 * of glass) each time the sheet reached or left the pill (the motion
 * review of 2026-11-22). The figures go while the route's field is open
 * (figuresAway). One size knob (--strip-full, lib/text's PIN_FIGURE), set
 * once a size. While the tab bar's Routes is pressed the suggested routes'
 * chips take the figures' place, at the pill too (the owner, 2026-11-23:
 * "When routes is tapped, show the routes instead of the figures strip"):
 * one slot, so neither the tabs nor the route above move, and a chip
 * tapped flies that way with the chips kept out to compare; Routes again,
 * Brief or Nav Log bring the figures back (FplTabBar).
 */
function GroundFoot({
  vm,
  more,
  fileable,
  onFile,
  routes,
}: {
  vm: PlanSlices<"brief" | "flight" | "fpl" | "plan" | "route" | "routeList" | "stops">;
  more: ReactNode;
  fileable: boolean;
  onFile?: () => void;
  routes?: RouteOptions;
}) {
  const pill = useFootRest() === "peek";
  const line = routesOut(vm) ? vm.routeList.routeLine : null;
  const tabs = useTabsWidth();
  return (
    <div ref={tabs} className="flex w-full flex-col" style={{ "--strip-full": pill ? 1 : 0 } as CSSProperties}>
      {!figuresAway(vm) && (
        <div
          data-foot-strip=""
          // At the pill the figures fill the pill's room under the grabber,
          // centred, as the sheet's own face did, one row of all that fit
          // (TripFigures' `pill`); the room its least, so a larger text
          // size grows the bar rather than spilling over the map, and the
          // bar's measured height, the map's room, follows (the r6 UI
          // audit's H1). From half up a thin line just over the tabs.
          // From half up as wide as the tab bar's capsule under it, the
          // figures spread over it, the first over Brief and the last over
          // More (the owner, 2026-11-26: "for small size, span the width
          // of tabs bar"); at the pill the bar's whole width, and the
          // suggested routes' chips, when they take its place, the whole
          // width too.
          className={cn("flex flex-col px-1", pill ? "justify-center" : cn("pt-2", !line && "mx-auto w-full max-w-(--tabs-width,100%)"))}
          style={pill ? { minHeight: `calc(${FOOT_BAR_PILL} - ${EDGE_ROOM})` } : undefined}
        >
          {line ? (
            // Only the chips take touches (RouteLine's `grouped`): the rest
            // of the row passes them to the sheet as the bar's ground does
            // (sheet/FootBar), so at the pill a tap or an upward drag there
            // still opens the sheet (the r10 audit's W-L1).
            <section aria-label="Suggested routes" className="pointer-events-none" data-testid="route-group">
              <Suspense fallback={<div className="h-7" />}>
                <RouteLine line={line} grouped />
              </Suspense>
            </section>
          ) : (
            <FlightFigures vm={vm} grow={false} thin pill={pill} />
          )}
        </div>
      )}
      <div className={cn(pill && "hidden")}>
        <FplTabBar vm={vm} more={more} fileable={fileable} onFile={onFile} routes={routes} />
      </div>
    </div>
  );
}
