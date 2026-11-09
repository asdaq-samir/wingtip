import { useEffect, useState } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { GLASS } from "../../lib/mapChrome";
import { LATEST_KEPT_MS, useLatestAtcCall } from "../../lib/atc/latestCall";
import { TEXT } from "../../lib/text";
import { useFeelOnNew } from "../../lib/haptics";
import { useCopilot } from "./useCopilot";

/** A warning's red, a caution's amber, as the alerts banner's are; an
 *  advisory in the text's own ink. */
const INK = { warning: "text-destructive-ink", caution: "text-caution-ink", advisory: "text-foreground" } as const;

const ICON = { warning: TriangleAlert, caution: CircleAlert, advisory: Info } as const;

/** With no message of its own, the ATC copilot's last call to us in one
 *  line (lib/atc/latestCall), once its card is put away and for a while
 *  after: the altitude, heading and frequency last given, and what the
 *  pilot set from it (the next frequency, the code). */
function AtcLine() {
  const atc = useLatestAtcCall();
  // The line heard at `at` goes LATEST_KEPT_MS after it.
  const [gone, setGone] = useState<number | null>(null);
  useEffect(() => {
    if (atc.at == null) return;
    const at = atc.at;
    const timer = window.setTimeout(() => setGone(at), Math.max(0, at + LATEST_KEPT_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [atc.at]);
  if (!atc.line || atc.cardShown || atc.at == null || gone === atc.at) return null;
  const set = [atc.frequency && `Next ${atc.facility ? `${atc.facility} ` : ""}${atc.frequency}`, atc.squawk && `Code ${atc.squawk}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <p
      className={cn(GLASS, "w-fit max-w-full rounded-(--radius-banner) px-3 py-2 tabular-nums", TEXT.detail)}
      role="status"
      data-testid="copilot-atc-line"
    >
      <span className="font-semibold">ATC </span>
      {atc.line}
      {set && <span className="text-muted-foreground"> · {set}</span>}
    </p>
  );
}

/**
 * The in-flight copilot's one message (useCopilot), in the map's banner
 * column under what is ahead: its line, and a tap opening the why and
 * where each figure comes from (the METAR, 14 CFR, ITWS ...), look and go.
 * OK puts that message away; a new one comes in its place. Nothing while
 * the first thing that matters is one the alerts banner already shows.
 */
export default function CopilotBanner() {
  const { message, dismiss } = useCopilot();
  // A new warning or caution felt as it comes up (lib/haptics); an advisory only shown.
  useFeelOnNew(message && message.level !== "advisory" && !message.elsewhere ? `${message.kind}:${message.title}` : null, "warning");
  const [open, setOpen] = useState(false);
  if (!message || message.elsewhere) return <AtcLine />;
  const Icon = ICON[message.level];
  return (
    <div className={cn(GLASS, "pointer-events-auto w-fit max-w-full rounded-(--radius-banner)")} data-copilot-banner={message.kind}>
      <Alert
        // Told to a screen reader once by useCopilot (lib/announce): a
        // live region arriving with its words in it is not read by every
        // reader, and the message is read again with each look.
        role="region"
        aria-label="Copilot"
        className={cn(
          "flex min-h-11 gap-2 rounded-(--radius-banner) border-transparent bg-transparent py-1 pr-1 pl-3 *:[svg]:translate-y-0",
          open ? "items-start *:[svg]:mt-[0.6rem]" : "items-center",
          INK[message.level],
        )}
      >
        <Icon className="shrink-0" />
        <Collapsible open={open} onOpenChange={setOpen} className={cn("flex min-w-0 flex-1 flex-col self-stretch", TEXT.detail)}>
          <CollapsibleTrigger
            data-testid="copilot-title"
            className="flex min-w-0 flex-1 flex-col justify-center py-1 text-left outline-none focus-visible:underline"
          >
            <span className={cn("block max-w-full font-semibold", !open && "line-clamp-2")}>{message.title}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5 pb-1 text-foreground" data-testid="copilot-detail">
            {message.detail.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {message.sources.map((source) => (
              <p key={source} className="text-muted-foreground" data-copilot-source="">
                {source}
              </p>
            ))}
          </CollapsibleContent>
        </Collapsible>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("shrink-0 rounded-full text-tint", open && "self-start")}
          data-testid="copilot-dismiss"
          onClick={() => {
            dismiss();
            setOpen(false);
          }}
        >
          OK
        </Button>
      </Alert>
    </div>
  );
}
