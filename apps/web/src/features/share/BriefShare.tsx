import type { ReactNode } from "react";
import { Printer, RotateCw } from "lucide-react";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { refreshLive } from "../../lib/liveRefresh";
import { ShareMenuShell, type ShellLook } from "./ShareMenuShell";
import { ShareLinkItem, type SharedRoute } from "./shareItems";

/**
 * The Brief's share (the owner: "every share button needs to be specific
 * to that card. So printing briefing should only be in brief card"): its
 * link, Save and the solo cross-country review, Print the briefing and
 * Refresh.
 */
export function BriefShare({
  route,
  saving,
  reviewSheet,
  planAgain,
  ...look
}: ShellLook & {
  route: SharedRoute;
  /** Save and the review's item, given the way to open the review's sheet. */
  saving: (askReview: () => void) => ReactNode;
  /** The review's sheet, given the way to put it away. */
  reviewSheet: (done: () => void) => ReactNode;
  /** Plan again -- fresh winds, weather and fuel -- with the Brief's Refresh
   *  (the owner, 2026-11-21: More keeps only Route Options, Share link and
   *  Open in ForeFlight; the plan has no refresh of its own but this). */
  planAgain?: { onPlan: () => void };
}) {
  return (
    <ShareMenuShell card="brief" reviewSheet={reviewSheet} {...look}>
      {({ afterMenu, askReview }) => (
        <>
          <ShareLinkItem route={route} />
          {/* Save and the review, the Brief's (the owner, 2026-11-21). */}
          {route.routed && saving(askReview)}
          {/* Printed once the menu has gone, so it is not on the paper: the
              whole briefing. */}
          <DropdownMenuItem disabled={!route.routed} onClick={afterMenu(() => window.print())} data-testid="print-briefing">
            <Printer />
            Print the Briefing
          </DropdownMenuItem>
          {/* The Brief's live reports asked again now, as the route's
              Refresh is in its own menu: the head keeps its two buttons
              (rules.md). Kept fresh by themselves besides (useLiveRefresh). */}
          <DropdownMenuItem
            onClick={() => {
              void refreshLive("brief");
              planAgain?.onPlan();
            }}
            data-testid="brief-refresh"
          >
            <RotateCw />
            Refresh
          </DropdownMenuItem>
        </>
      )}
    </ShareMenuShell>
  );
}
