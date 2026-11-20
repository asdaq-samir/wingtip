import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../components/PageToggle";
import { TEXT } from "../../../lib/text";

/**
 * FPL's first row, under the grabber, as Apple Maps' Directions is (the
 * owner, 2026-11-19: "Flight plan should be the title under the grabber
 * just like Directions of Apple Maps"; "Maybe we can have similar buttons x
 * and share"): Share at its start (the route's menu, ShareMenu), "Flight
 * Plan" in its middle at the row's 17 in bold as Directions' headline is,
 * and the ✕ at its end, which closes the page to Search where the search's
 * row has its toggle (PageToggle). The row keeps the search's height, so a
 * turn of the page moves nothing (the owner, 2026-11-14). Route Options and
 * the airplane's strip are the rows under it (FplStrip).
 *
 * Three columns, the title in the middle: either side one share of what is
 * left, at least a round button's 36 points, so the title stays in the
 * row's middle whether Share is there or not (its slot kept, empty).
 */
export default function FplBar({ share }: { share?: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[minmax(2.25rem,1fr)_auto_minmax(2.25rem,1fr)] items-center gap-2">
      <div className="flex justify-start">{share}</div>
      <h2 className={cn("truncate font-bold text-foreground", TEXT.row)} data-testid="fpl-title">
        Flight Plan
      </h2>
      <div className="flex justify-end">
        <PageToggle page={1} />
      </div>
    </div>
  );
}

/** The airplane's strip -- its N-number and the altitude (RouteControls)
 *  -- its pills alone, centred and tucked under FPL's title (FplBar) as
 *  Apple Maps' "Time and Options" is under "Directions", with no bar round
 *  them (the owner, 2026-11-19: "Ours is not as slick as Apple Maps
 *  direction header with title and buttons and pills"). In a row too
 *  narrow for all of it -- a local flight's date and time pills, a
 *  320-point phone -- its airplane's pill gives way first (navlog's
 *  pillLook). */
export function FplStrip({ strip, options }: { strip: ReactNode; options?: ReactNode }) {
  return (
    // Route Options first on the same line as the airplane's pills, one
    // row under the title, so the route starts as high as before it came.
    <div className="-mt-2 flex min-w-0 items-center justify-center gap-1.5 pb-3">
      {options}
      <div className="flex min-w-0 items-center" data-testid="route-strip">
        {strip}
      </div>
    </div>
  );
}
