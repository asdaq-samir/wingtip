import type { ReactNode } from "react";
import { cn } from "cn";
import { PILL_FACE, RISEN_FACE } from "./insets";

/**
 * The one way a sheet's pill hands over to the sheet risen (sheet/insets'
 * PILL_FACE and RISEN_FACE): at the pill both are drawn in one place, the
 * pill's face in sight and the risen one laid out over it but hidden; a
 * finger taking the sheet fades the one out and the other in, by CSS alone
 * as the airport card's body comes into sight, so nothing is built or
 * swapped while the sheet moves. Away from the pill, the risen face alone,
 * in the same box.
 * FPL's foot hands its large figures to its actions' bar this way
 * (FlightFoot); any sheet whose pill is not simply its top does the same.
 */
export function PillHandover({ atPill, pill, risen }: { atPill: boolean; pill: ReactNode; risen: ReactNode }) {
  // One tree at every size, the risen face's box kept, so settling at half
  // changes its classes only and builds nothing again.
  return (
    <div className="relative w-full">
      {atPill && <div className={PILL_FACE}>{pill}</div>}
      {/* At the pill over its face from the foot up, out of its layout, so
          the pill keeps its one height; hidden till the finger takes it. */}
      <div className={atPill ? cn("absolute inset-x-0 bottom-0", RISEN_FACE) : undefined}>{risen}</div>
    </div>
  );
}
