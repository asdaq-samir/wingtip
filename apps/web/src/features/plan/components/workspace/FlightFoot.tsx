import { Suspense, type ReactNode } from "react";
import { RISEN_OVER } from "../../../../components/sheet/insets";
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
 *  under the route and, held at the foot, FPL's pill (FplRoute), and in
 *  flight or a dry run at the foot, large (`grow`). The figures ask
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
 *  figures while it plays; in flight the flight's figures and Done flying;
 *  on the ground the actions' floating bar (FplTabBar), the figures being
 *  the route row's and its pill (FplRoute). */
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
    <div className={cn("flex items-center justify-between pt-1 text-foreground/65", TEXT.note)}>
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
  // On the ground, on FPL's page (not at the Profile card's foot, no
  // `share`), the actions' bar alone: the figures are the route row's, and
  // at the pill they are the pill itself (FplRoute). At the pill the bar
  // lies over the foot out of sight, coming into sight as a finger takes
  // the sheet (RISEN_OVER).
  if (share && !dryRunning && !flying) {
    const bar = <FplTabBar vm={vm} share={share} />;
    return (
      <div className="relative w-full">{panelOpen ? bar : <div className={cn("absolute inset-x-0 bottom-0", RISEN_OVER)}>{bar}</div>}</div>
    );
  }
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
