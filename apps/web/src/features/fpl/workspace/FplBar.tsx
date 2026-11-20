import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../components/PageToggle";
import { TEXT } from "../../../lib/text";

/**
 * FPL's first row, under the grabber, as Apple Maps' Directions is, its
 * title at the row's 17 in bold as Directions' headline is (the owner,
 * 2026-11-19: "Our title can also be smaller font like Apple Maps") (the
 * owner, 2026-11-19: "Flight plan should be the title under the grabber
 * just like Directions of Apple Maps"): the suggested routes' button at its
 * start, "Flight Plan" in its middle and the page toggle at its end, where
 * the search's row has it (PageToggle). The row keeps the search's height,
 * so a turn of the page moves nothing (the owner, 2026-11-14). The
 * airplane's strip -- its N-number and the altitude -- is the row under
 * it (FplStrip), as Directions has its options under its title.
 *
 * Three columns, the title in the middle: either side one share of what is
 * left, at least a round button's 36 points, so the title stays in the
 * row's middle whether the routes' button is there or not (its slot kept,
 * empty).
 */
export default function FplBar({ routes }: { routes?: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[minmax(2.25rem,1fr)_auto_minmax(2.25rem,1fr)] items-center gap-2">
      <div className="flex justify-start">{routes}</div>
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
export function FplStrip({ strip }: { strip: ReactNode }) {
  return (
    <div className="-mt-2 flex min-w-0 justify-center pb-3">
      <div className="flex min-w-0 items-center" data-testid="route-strip">
        {strip}
      </div>
    </div>
  );
}
