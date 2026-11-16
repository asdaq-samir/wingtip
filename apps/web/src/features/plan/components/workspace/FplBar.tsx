import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../../components/PageToggle";
import { SHEET_BAR } from "../../../../components/panelField";

/**
 * FPL's first row, the search's row's twin (the owner, 2026-11-14: "for
 * all three fpl layouts, keep the n-number strip with buttons in the same
 * size as search bar. So toggling between search and fpl keeps the
 * same-size component with a toggle replacing account"): the airplane's
 * strip -- its N-number, the altitude, the Profile, the Brief and the
 * route's ••• (RouteControls) -- in a bar the one search's field's size
 * (SHEET_BAR), and the page toggle at its end where the search's row has
 * it (PageToggle). The route, in whichever of its three ways, is the row
 * under it (RouteHead), never in it.
 */
export default function FplBar({ strip }: { strip: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-2" data-testid="fpl-bar">
      <div className={cn("flex items-center pr-1 pl-1.5", SHEET_BAR)} data-testid="route-strip">
        {strip}
      </div>
      <PageToggle page={1} />
    </div>
  );
}
