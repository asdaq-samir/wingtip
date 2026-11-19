import { Mic } from "lucide-react";
import MapBanner, { BannerButton } from "../../components/MapBanner";
import AtcCard from "./AtcCard";
import { useAtcCopilot } from "./useAtcCopilot";

/**
 * The ATC copilot over the map, in the banners' column (MapBanners) while
 * the pilot has it on: the newest call to us as its card (AtcCard); while
 * flying and not yet listening, one line and a tap to start, since a page
 * may start the microphone only from a tap; flying with no registration
 * to listen for, a line saying so (no airplane is ever assumed). The lines
 * are the map's one banner (MapBanner).
 */
export default function AtcCopilot() {
  const atc = useAtcCopilot();
  if (!atc.on) return null;
  if (atc.card) {
    return (
      <AtcCard
        card={atc.card}
        can={atc.can}
        problem={atc.problem}
        onAct={(i) => void atc.act(i)}
        onReadBack={atc.readBackNow}
        onClose={atc.dismiss}
      />
    );
  }
  if (atc.noTail) {
    return <MapBanner data-testid="atc-no-tail" icon={Mic} tone="tint" title="ATC: pick your airplane to listen for its call sign" />;
  }
  if (atc.needsTap) {
    return (
      <MapBanner
        data-testid="atc-listen"
        icon={Mic}
        tone={atc.error ? "caution" : "tint"}
        title={atc.error ?? "ATC: not listening yet"}
        actions={
          <BannerButton onClick={atc.listen} data-testid="atc-listen-start">
            Listen
          </BannerButton>
        }
      />
    );
  }
  return null;
}
