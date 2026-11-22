import { Suspense, type ReactNode } from "react";
import { RISEN_OVER } from "../../../components/sheet/insets";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { EngineGate } from "../../../lib/engine/engineGate";
import { TEXT } from "../../../lib/text";
import { TripFigures } from "../../navlog";
import { DirectStrip } from "../../route";
import { DryRunFigures } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { FplTabBar, type RouteOptions } from "./FplTabBar";

/** The flight's figures (TripFigures, on the one FigureStrip) in every
 *  state, and over them a Direct to's strip: on the ground under the route
 *  and, held at the foot, FPL's pill (FplRoute); at the foot (`foot`), large
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
}: {
  vm: PlanSlices<"brief" | "flight" | "plan" | "route" | "stops">;
  grow: boolean;
  foot?: boolean;
  /** One thin line (TripFigures' `thin`). */
  thin?: boolean;
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
        <TripFigures {...line} grow={grow} thin={thin} unknown={s.unknownPlace} legCourseDeg={s.legs[0]?.magnetic_course_deg ?? null} />
      </div>
    </EngineGate>
  );
}

/** What is pinned at FPL's foot (PlanWorkspace's `foot`): the dry run's
 *  figures while it plays; in flight the flight's figures and Done flying;
 *  on the ground the actions' floating bar (FplTabBar), the figures being
 *  the route row's and its pill (FplRoute). */
export default function FlightFoot({
  vm,
  more,
  fileable = false,
  onFile,
  routes,
}: {
  vm: PlanSlices<"brief" | "flight" | "fpl" | "plan" | "route" | "stops" | "view">;
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
  const { panelOpen } = vm.view;
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
  // `more`), the actions' bar alone: the figures are the route row's, and
  // at the pill they are the pill itself (FplRoute). At the pill the bar
  // lies over the foot out of sight, coming into sight as a finger takes
  // the sheet (RISEN_OVER). One wrapper at every size, only its classes
  // changed, so the same bar stays: a wrapper there at the pill alone gave
  // the tree another shape there, and React built the bar afresh (its
  // toolbar, its menu, its two panes of glass) each time the sheet reached
  // or left the pill, as the settle began (the motion review of 2026-11-22:
  // the bar's element not the same after a trip to the pill).
  if (more && !dryRunning && !flying) {
    return (
      <div className="relative w-full">
        <div className={panelOpen ? undefined : cn("absolute inset-x-0 bottom-0", RISEN_OVER)}>
          <FplTabBar vm={vm} more={more} fileable={fileable} onFile={onFile} routes={routes} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 w-full flex-col">
      <FlightFigures vm={vm} grow foot />
      {doneFlyingRow}
    </div>
  );
}
