import type { ReactNode } from "react";
import { CardHead } from "../../../components/CardHead";
import PanelTabs from "./navlog/PanelTabs";
import BriefOverview from "./briefing/BriefOverview";
import type { PanelTab } from "./navlog/panelTab";
import RefreshButton from "../../../components/RefreshButton";
import { CardLayer } from "../../../components/sheet/CardLayer";

/**
 * FPL's Brief, a card over it as an airport's is, at the owner's ask ("we
 * can have a brief button which can open a new brief card to have
 * everything preflight, depart, enroute, arrive. But FPL is simple with
 * route, navlog, profile and calculations"): the route's name and its plan
 * at its head (CardHead), then the assistant's field, whether to go, the
 * risk, NOTAMs and weather in words and the flight watch round a card
 * for each part of the flight (BriefOverview round BriefGlance, the
 * owner's pick of the redesign, D′), each card opening its page
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
  route,
}: {
  name: ReactNode;
  /** Under the name: where from and to, the airplane, the altitude, when. */
  line: ReactNode;
  contents: Record<PanelTab, ReactNode>;
  /** The briefing's warnings, over every page. */
  notice?: ReactNode;
  /** Pages with something to fix (red) or to look at (amber). */
  marks?: Partial<Record<PanelTab, "stop" | "caution">>;
  onClose: () => void;
  /** The legs asked for from a page: FPL's nav log in place of the card. */
  onLegs: () => void;
  route: string;
}) {
  // A card of its own over the sheet, the stock Drawer's nested drawer
  // (CardLayer, the owner 2026-11-11), as an airport's card is.
  return (
    <CardLayer>
      <div className="flex min-h-0 flex-1 flex-col print:hidden" data-testid="brief-card">
        <PanelTabs
          printing={false}
          marks={marks}
          route={route}
          notice={notice}
          contents={contents}
          onLegs={onLegs}
          overview={BriefOverview}
          before={
            // Its room over the name the grabber's, which the pinned head's frost reaches up over (PinnedHead).
            <div className="px-4 pt-(--pinned-room) [--pinned-room:var(--corner-inset,0.75rem)]">
              <CardHead
                name={name}
                line={line}
                nameTestId="brief-name"
                lineTestId="brief-line"
                onClose={onClose}
                onShare="brief"
                closeTestId="brief-close"
              >
                {/* The live reports asked again; kept fresh by themselves too. */}
                <RefreshButton card="brief" label="Refresh the Brief" />
              </CardHead>
            </div>
          }
        />
      </div>
    </CardLayer>
  );
}
