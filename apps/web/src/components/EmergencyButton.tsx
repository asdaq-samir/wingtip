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
 * EMER, the flight's airplane's emergency checklists one tap from the
 * chart, as #220 asks ("the emergency checklists one tap away in flight",
 * the owner's option A, 2026-11-08), and on the ground as well, last in the
 * map's buttons as the iPhone has it (the owner's decision at the end of
 * the wave, 2026-11-08: an engine fire during start is one of the
 * emergencies). In flying mode's stack with NRST and D→ (MapControls) it
 * is a 60-point word under the others; on the ground a round button the
 * size of its neighbours. Its word in the destructive red, as an
 * emergency control is, where the others are the tint. The lists are the
 * pilot's own, kept on this device (lib/checklists).
 */
export default function EmergencyButton({ flying }: { flying: boolean }) {
  const [open, setOpen] = useState(false);
  const aircraft = usePreferences(s => s.aircraft);
  const airplane = aircraftKey(aircraft);
  const name = shortName(aircraft.label);
  return (
    <>
      <Button
        type="button" variant="ghost" size={flying ? undefined : "icon"} aria-label="Emergency checklists"
        data-testid={flying ? "flying-emergency" : "map-emergency"}
        className={flying ? cn(FLYING_BUTTON, "text-[0.8125rem] text-destructive") : "text-[0.625rem] font-extrabold text-destructive"}
        onClick={() => setOpen(true)}
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
