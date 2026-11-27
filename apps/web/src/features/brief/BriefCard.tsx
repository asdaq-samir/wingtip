import { useEffect, type ReactNode } from "react";
import { CardHead } from "../../components/CardHead";
import { PanelTabs } from "../navlog/lazy";
import BriefOverview from "./BriefOverview";
import VerdictPill from "./VerdictPill";
import type { PanelTab } from "../plan";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { CardLayer } from "../../components/sheet/CardLayer";
import { prefetchAirportSections } from "./airportSectionsChunk";

/**
 * FPL's Brief, a card over it as an airport's is, at the owner's ask ("we
 * can have a brief button which can open a new brief card to have
 * everything preflight, depart, enroute, arrive. But FPL is simple with
 * route, navlog, profile and calculations"): "Brief" and its plan, the route first
 * at its head (CardHead) with whether to go under them (VerdictPill), then
 * when, one grouped list of the findings and the parts of the flight, and
 * the flight watch (BriefOverview round BriefGlance, the owner's pick of
 * option A, 2026-11-19), each row opening its page
 * (PanelTabs) -- Preflight, Depart, En route, the legs left to FPL, and
 * Arrive -- the close going back from a page to the cards. On paper the
 * briefing is FPL's, every page after the legs (NavLogView).
 */
export default function BriefCard({
  name,
  line,
  contents,
  notice,
  marks,
  onClose,
  onLegs,
  routeKey,
}: {
  name: ReactNode;
  /** Under the name in its pinned head, at every size: the altitude, when,
   *  the airplane, where from and to. It was a line under the head the
   *  Brief scrolled over (the UI audit's B2, 2026-11-17). */
  line: ReactNode;
  contents: Record<PanelTab, ReactNode>;
  /** The briefing's warnings, over every page. */
  notice?: ReactNode;
  /** Pages with something to fix (red) or to look at (amber). */
  marks?: Partial<Record<PanelTab, "stop" | "caution">>;
  onClose: () => void;
  /** The legs asked for from a page: FPL's nav log in place of the card. */
  onLegs: () => void;
  /** The route its pages are of, for their stale dim (PanelTabs). */
  routeKey: string;
}) {
  // Its live reports kept fresh by themselves (on their timers and as the
  // card comes back into sight); asked again now from its ••• (ShareMenu).
  useLiveRefresh("brief");
  // The airport sections' chunk as the card comes up, before its pages ask.
  useEffect(prefetchAirportSections, []);
  // A card of its own over the sheet, the stock Drawer's nested drawer
  // (CardLayer, the owner 2026-11-11), as an airport's card is.
  return (
    <CardLayer>
      <div className="flex min-h-0 flex-1 flex-col print:hidden" data-testid="brief-card">
        <PanelTabs
          printing={false}
          marks={marks}
          notice={notice}
          contents={contents}
          onLegs={onLegs}
          routeKey={routeKey}
          overview={BriefOverview}
          before={
            // Its room over the name the grabber's, which the pinned head's frost reaches up over (PinnedHead).
            <div className="px-4 pt-(--pinned-room) [--pinned-room:var(--corner-inset,0.75rem)]">
              <CardHead
                name={name}
                sub={line}
                // The route, the altitude, when and the airplane wrap under
                // "Brief" rather than run off the panel: at the owner's larger
                // text a two-stop route lost its destination ("C81 → KGCT →
                // KIML → KDE…") and an iPhone its time (the HIG audit of
                // 2026-11-23, M1).
                wrap
                below={<VerdictPill />}
                nameTestId="brief-name"
                onClose={onClose}
                onShare="brief"
                closeTestId="brief-close"
              />
            </div>
          }
        />
      </div>
    </CardLayer>
  );
}
