import type { ReactNode } from "react";
import PanelTabs from "./navlog/PanelTabs";
import BriefOverview from "./briefing/BriefOverview";
import type { PanelTab } from "./navlog/panelTab";
import { useLiveRefresh } from "../../../lib/liveRefresh";

/**
 * FPL's Brief, a tab under the route (FplTabs; the owner, 2026-11-14: "the
 * same tab bar ... with brief, navlog, profile"), where it was a card over
 * FPL (the owner's earlier ask: "we can have a brief button which can open
 * a new brief card to have everything preflight, depart, enroute, arrive"):
 * whether to go, when, the NOTAMs that matter and the flight watch round a
 * card for each part of the flight (BriefOverview round BriefGlance, the
 * owner's pick of the redesign, D′), each card opening its page
 * (PanelTabs) -- Preflight, Depart, En route, the legs left to the Nav
 * Log, and Arrive -- Back going from a page to the cards. The route's name
 * and its airplane are FPL's head over it. On paper the briefing is FPL's,
 * every page after the legs (NavLogView).
 */
export default function BriefPage({
  contents,
  notice,
  marks,
  onLegs,
  route,
}: {
  contents: Record<PanelTab, ReactNode>;
  /** The briefing's warnings, over every page. */
  notice?: ReactNode;
  /** Pages with something to fix (red) or to look at (amber). */
  marks?: Partial<Record<PanelTab, "stop" | "caution">>;
  /** The legs asked for from a page: the Nav Log's tab. */
  onLegs: () => void;
  route: string;
}) {
  // Its live reports kept fresh by themselves (on their timers and as the
  // tab comes back into sight); asked again now from the route's •••
  // (ShareMenu) while it is up.
  useLiveRefresh("brief");
  return (
    <div className="flex min-h-0 flex-col print:hidden" data-testid="brief-page">
      <PanelTabs
        printing={false}
        marks={marks}
        route={route}
        notice={notice}
        contents={contents}
        onLegs={onLegs}
        overview={BriefOverview}
        before={null}
      />
    </div>
  );
}
