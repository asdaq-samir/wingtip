import { Suspense, type ReactNode } from "react";
import { PillHandover } from "../../../../components/sheet/PillHandover";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { EngineGate } from "../../../../lib/engine/engineGate";
import { TEXT } from "../../../../lib/text";
import FlightLine from "../FlightLine";
import DirectStrip from "../DirectStrip";
import { DryRunFigures } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import { FplTabBar } from "./FplTabBar";

/** The flight's figures (FlightLine), and over them a Direct to's strip:
 *  under the route from half up, at their own size (FplRoute), and at the
 *  pill the sheet's one row, large (`grow`; the owner, 2026-11-16: "When
 *  swiping down, the calculations strip becomes bigger"). The figures ask
 *  the engine as they draw (figures.ts' strip_fuel), so they wait for its
 *  .wasm (EngineGate), the rest of the page not (the owner's iPhone,
 *  2026-11-11: "Part of the app didn't load" on "strip_fuel cannot be
 *  worked out"). */
export function FlightFigures({ vm, grow, quiet = false }: { vm: PlanWorkspaceModel; grow: boolean; quiet?: boolean }) {
  const { depart, directParam, planned } = vm.route;
  const { directToPoint, s } = vm.plan;
  const { firstFuelStop } = vm.stops;
  const { flying } = vm.flight;
  const { estimate } = vm.brief;
  return (
    <EngineGate>
      {/* Flown direct to a point: said over the figures, and Cancel. Put
          away in the pill, whose one row is the figures. */}
      {directParam && !quiet && (
        <div data-pill-hides="">
          <DirectStrip ident={directParam} onDevice={s.directOnDevice} onCancel={() => directToPoint(null)} />
        </div>
      )}
      <div data-testid={quiet ? undefined : "flight-line"}>
        <FlightLine
          totals={s.totals}
          estimate={estimate}
          destination={`${planned.dest}`}
          depart={depart}
          local={s.local}
          grow={grow}
          flying={flying}
          fuelStop={firstFuelStop}
          quiet={quiet}
        />
      </div>
    </EngineGate>
  );
}

/** What is pinned at FPL's foot (PlanWorkspace's `foot`): the dry run's
 *  figures while it plays; in flight the flight's figures and Done flying;
 *  on the ground the actions' floating bar from half up (FplTabBar), and
 *  at the pill the figures alone, large, the figures being under the route
 *  from half up (FplRoute). */
export default function FlightFoot({ vm, share }: { vm: PlanWorkspaceModel; share?: ReactNode }) {
  const { depart, planned } = vm.route;
  const { s } = vm.plan;
  const { doneFlying, dryRunning, flying } = vm.flight;
  const { estimate } = vm.brief;
  const { panelOpen } = vm.view;
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
  // The bar on FPL's page alone, not at the Profile card's foot (no
  // `share`): at the pill the figures, large, handed to the actions' bar as
  // a finger takes the sheet, by CSS (PillHandover; the owner, 2026-11-16:
  // the figures went from the foot to the route's row in one jump at the
  // release); from half up the bar.
  if (share && !dryRunning && !flying)
    return <PillHandover atPill={!panelOpen} pill={<FlightFigures vm={vm} grow />} risen={<FplTabBar vm={vm} share={share} />} />;
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
