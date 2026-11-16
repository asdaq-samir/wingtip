import { Suspense } from "react";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { EngineGate } from "../../../../lib/engine/engineGate";
import { TEXT } from "../../../../lib/text";
import FlightLine from "../FlightLine";
import DirectStrip from "../DirectStrip";
import { DryRunFigures } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/** The flight's figures (FlightLine), and over them a Direct to's strip:
 *  under the route from half up, at their own size (FplRoute), and at the
 *  pill the sheet's one row, large (`grow`; the owner, 2026-11-16: "When
 *  swiping down, the calculations strip becomes bigger"). The figures ask
 *  the engine as they draw (figures.ts' strip_fuel), so they wait for its
 *  .wasm (EngineGate), the rest of the page not (the owner's iPhone,
 *  2026-11-11: "Part of the app didn't load" on "strip_fuel cannot be
 *  worked out"). */
export function FlightFigures({ vm, grow }: { vm: PlanWorkspaceModel; grow: boolean }) {
  const { depart, directParam, planned } = vm.route;
  const { directToPoint, s } = vm.plan;
  const { firstFuelStop } = vm.stops;
  const { flying } = vm.flight;
  const { estimate } = vm.brief;
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
        <FlightLine
          totals={s.totals}
          estimate={estimate}
          destination={`${planned.dest}`}
          depart={depart}
          local={s.local}
          grow={grow}
          flying={flying}
          fuelStop={firstFuelStop}
        />
      </div>
    </EngineGate>
  );
}

/** What is pinned at FPL's foot (PlanWorkspace's `foot`): the dry run's
 *  figures while it plays; in flight the flight's figures and Done flying.
 *  On the ground the figures are the page's top (pages' figures) and the
 *  actions a floating bar in the page (FplTabBar). */
export default function FlightFoot({ vm }: { vm: PlanWorkspaceModel }) {
  const { depart, planned } = vm.route;
  const { s } = vm.plan;
  const { doneFlying, dryRunning, flying } = vm.flight;
  const { estimate } = vm.brief;
  // In flight, the one way out of flying mode (useFlyingMode): a small
  // Done flying at the figures' foot, as the canvas has the line there;
  // the tabs come back on the ground by themselves.
  const doneFlyingRow = flying && (
    <div className={cn("flex items-center justify-between pt-1 text-foreground/65", TEXT.note)} data-testid="flying-foot">
      <span>Flying</span>
      <Button
        variant="link"
        size="inline"
        className="relative font-semibold after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
        data-testid="done-flying"
        onClick={doneFlying}
      >
        Done flying
      </Button>
    </div>
  );
  return (
    <div className="flex min-h-0 w-full flex-col">
      {dryRunning ? (
        <EngineGate>
          <Suspense fallback={null}>
            <DryRunFigures
              run={dryRunning}
              totals={s.totals}
              estimate={estimate}
              destination={`${planned.dest}`}
              depart={depart}
              local={s.local}
              flying={flying}
            />
          </Suspense>
        </EngineGate>
      ) : (
        <FlightFigures vm={vm} grow />
      )}
      {doneFlyingRow}
    </div>
  );
}
