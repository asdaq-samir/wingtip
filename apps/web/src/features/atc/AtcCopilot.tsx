import { Mic } from "lucide-react";
import { cn } from "cn";
import { GLASS } from "../../lib/mapChrome";
import { Button } from "../../components/ui/button";
import { TEXT } from "../../lib/text";
import AtcCard from "./AtcCard";
import { useAtcCopilot } from "./useAtcCopilot";

/**
 * The ATC copilot over the map, in the banners' column (MapBanners) while
 * the pilot has it on: the newest call to us as its card (AtcCard); while
 * flying and not yet listening, one line and a tap to start, since a page
 * may start the microphone only from a tap; flying with no registration
 * to listen for, a line saying so (no airplane is ever assumed).
 */
export default function AtcCopilot() {
  const atc = useAtcCopilot();
  if (!atc.on) return null;
  if (atc.card) {
    return (
      <AtcCard
        card={atc.card} can={atc.can} problem={atc.problem}
        onAct={i => void atc.act(i)} onReadBack={atc.readBackNow} onClose={atc.dismiss}
      />
    );
  }
  if (atc.noTail) {
    return (
      <p className={cn(GLASS, "pointer-events-auto w-fit max-w-full rounded-[22px] px-3 py-2 text-muted-foreground", TEXT.detail)} role="status" data-testid="atc-no-tail">
        ATC: pick your airplane to listen for its call sign
      </p>
    );
  }
  if (atc.needsTap) {
    return (
      <div className={cn(GLASS, "pointer-events-auto flex w-fit max-w-full items-center gap-2 rounded-[22px] py-1 pr-1 pl-3")} data-testid="atc-listen">
        <Mic className="size-5 shrink-0 text-tint" aria-hidden="true" />
        <span className={cn("min-w-0", atc.error ? "text-caution-ink" : "text-muted-foreground", TEXT.detail)} role="status">
          {atc.error ?? "ATC: not listening yet"}
        </span>
        <Button size="sm" variant="secondary" className="relative shrink-0 rounded-full text-tint after:absolute after:-inset-1.5 after:content-['']" onClick={atc.listen} data-testid="atc-listen-start">
          Listen
        </Button>
      </div>
    );
  }
  return null;
}
