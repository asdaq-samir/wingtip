import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../components/PageToggle";
import { SHEET_BAR } from "../../../components/panelField";
import { TEXT } from "../../../lib/text";

/**
 * FPL's first row, under the grabber, as Apple Maps' Directions is (the
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
      <h2 className={cn("truncate font-bold text-foreground", TEXT.heading)} data-testid="fpl-title">
        Flight Plan
      </h2>
      <div className="flex justify-end">
        <PageToggle page={1} />
      </div>
    </div>
  );
}

/** The airplane's strip -- its N-number and the altitude (RouteControls)
 *  -- in a bar of the one search's field's look (SHEET_BAR), only as wide
 *  as its pills and centred, under FPL's title (FplBar), where it was the
 *  first row itself (the owner, 2026-11-17: "Center the n number and fl
 *  pills"). In a row too narrow for all of it -- a local flight's date and
 *  time pills, a 320-point phone -- its airplane's pill gives way first
 *  (navlog's pillLook). */
export function FplStrip({ strip }: { strip: ReactNode }) {
  return (
    <div className="flex min-w-0 justify-center pb-2">
      <div className={cn("flex items-center pr-1 pl-1.5", SHEET_BAR, "flex-none")} data-testid="route-strip">
        {strip}
      </div>
    </div>
  );
}
