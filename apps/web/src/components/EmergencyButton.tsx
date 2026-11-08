import { lazy, Suspense, useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import SheetDialog from "./SheetDialog";
import { FLYING_BUTTON } from "./mapChrome";
import { aircraftKey, shortName } from "../lib/aircraftChoice";
import { usePreferences } from "../lib/preferences";

/** The checklist's page, fetched as EMER is first tapped, never on the
 *  first load. */
const ChecklistPage = lazy(() => import("../features/pilot/ChecklistPage"));

/**
 * EMER, in flying mode's stack with NRST and D→ (MapControls): the flight's
 * airplane's emergency checklists one tap from the chart, as #220 asks
 * ("the emergency checklists one tap away in flight", the owner's option A,
 * 2026-11-08). Added under the stack's other words, at their 60 points;
 * nothing of the stack moved. Its word in the destructive red, as an
 * emergency control is, where the stack's others are the tint. The lists
 * are the pilot's own, kept on this device (lib/checklists).
 */
export default function EmergencyButton() {
  const [open, setOpen] = useState(false);
  const aircraft = usePreferences(s => s.aircraft);
  const airplane = aircraftKey(aircraft);
  const name = shortName(aircraft.label);
  return (
    <>
      <Button
        type="button" variant="ghost" aria-label="Emergency checklists" data-testid="flying-emergency"
        className={cn(FLYING_BUTTON, "text-[0.8125rem] text-destructive")} onClick={() => setOpen(true)}
      >
        EMER
      </Button>
      <SheetDialog open={open} onOpenChange={setOpen} title={`${name} emergency`} testId="emergency-checklists">
        {open && (
          <Suspense fallback={null}>
            <ChecklistPage key={airplane} airplane={airplane} name={name} kind="emergency" />
          </Suspense>
        )}
      </SheetDialog>
    </>
  );
}
