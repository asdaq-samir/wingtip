import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../components/PageToggle";
import { SHEET_BAR } from "../../../components/panelField";

/**
 * FPL's first row, the search's row's twin (the owner, 2026-11-14: "for
 * all three fpl layouts, keep the n-number strip with buttons in the same
 * size as search bar. So toggling between search and fpl keeps the
 * same-size component with a toggle replacing account"): the airplane's
 * strip -- its N-number, the altitude, the Profile, the Brief and the
 * route's ••• (RouteControls) -- in a bar the one search's field's size
 * (SHEET_BAR), and the page toggle at its end where the search's row has
 * it (PageToggle). The route, folded or open to edit, is the row under it
 * (RouteHead), never in it. The bar only as wide as its pills, the
 * suggested routes' button before it at the row's start and the page
 * toggle at its end (the owner, 2026-11-17: "make the n-number and altitude
 * container pill smaller and add the routes button on the top left").
 */
export default function FplBar({ strip, routes }: { strip: ReactNode; routes?: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-2">
      {routes}
      {/* The bar in the row's middle, between the two round buttons (the
          owner, 2026-11-17: "Center the n number and fl pills"). */}
      <span className="flex-1" />
      <div className={cn("flex items-center pr-1 pl-1.5", SHEET_BAR, "w-fit flex-none")} data-testid="route-strip">
        {strip}
      </div>
      <span className="flex-1" />
      <PageToggle page={1} />
    </div>
  );
}
