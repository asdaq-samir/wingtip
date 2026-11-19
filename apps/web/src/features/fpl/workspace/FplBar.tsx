import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../components/PageToggle";
import { SHEET_BAR } from "../../../components/panelField";

/**
 * FPL's first row, the search's row's twin (the owner, 2026-11-14: "for
 * all three fpl layouts, keep the n-number strip with buttons in the same
 * size as search bar. So toggling between search and fpl keeps the
 * same-size component with a toggle replacing account"): the airplane's
 * strip -- its N-number and the altitude (RouteControls) -- in a bar the one search's field's look
 * (SHEET_BAR), and the page toggle at its end where the search's row has
 * it (PageToggle). The route, folded or open to edit, is the row under it
 * (RouteHead), never in it. The bar only as wide as its pills, the
 * suggested routes' button before it at the row's start and the page
 * toggle at its end (the owner, 2026-11-17: "make the n-number and altitude
 * container pill smaller and add the routes button on the top left").
 *
 * Three columns, the bar's in the middle (the owner, 2026-11-17: "Center
 * the n number and fl pills"): either side one share of what is left, at
 * least a round button's 36 points, so the bar stays in the row's middle
 * whether the routes' button is there or not (its slot kept, empty), and
 * gives way to them in a row too narrow for all of it -- a local flight's
 * date and time pills, a 320-point phone -- its airplane's pill first
 * (navlog's pillLook), where a bar that could not shrink pushed the page
 * toggle off the sheet.
 */
export default function FplBar({ strip, routes }: { strip: ReactNode; routes?: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[minmax(2.25rem,1fr)_auto_minmax(2.25rem,1fr)] items-center gap-2">
      <div className="flex justify-start">{routes}</div>
      <div className={cn("flex items-center pr-1 pl-1.5", SHEET_BAR)} data-testid="route-strip">
        {strip}
      </div>
      <div className="flex justify-end">
        <PageToggle page={1} />
      </div>
    </div>
  );
}
