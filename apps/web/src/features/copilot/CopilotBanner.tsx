import { useState } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { GLASS } from "../../components/mapChrome";
import { TEXT } from "../../lib/text";
import { useCopilot } from "./useCopilot";

/** A warning's red, a caution's amber, as the alerts banner's are; an
 *  advisory in the text's own ink. */
const INK = {
  warning: "text-destructive-ink",
  caution: "text-caution-ink",
  advisory: "text-foreground",
} as const;

const ICON = { warning: TriangleAlert, caution: CircleAlert, advisory: Info } as const;

/**
 * The in-flight copilot's one message (useCopilot), in the map's banner
 * column under what is ahead: its line, and a tap opening the why and
 * where each figure comes from (the METAR, 14 CFR, ITWS ...), look and go.
 * OK puts that message away; a new one comes in its place. Nothing while
 * the first thing that matters is one the alerts banner already shows.
 */
export default function CopilotBanner() {
  const { message, dismiss } = useCopilot();
  const [open, setOpen] = useState(false);
  if (!message || message.elsewhere) return null;
  const Icon = ICON[message.level];
  return (
    <div className={cn(GLASS, "pointer-events-auto w-fit max-w-full rounded-[22px]")} data-copilot-banner={message.kind}>
      <Alert
        role={message.level === "warning" ? "alert" : "status"}
        className={cn(
          "flex min-h-11 gap-2 rounded-[22px] border-transparent bg-transparent py-1 pr-1 pl-3 *:[svg]:translate-y-0",
          open ? "items-start *:[svg]:mt-[0.6rem]" : "items-center", INK[message.level],
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
            {message.detail.map(line => <p key={line}>{line}</p>)}
            {message.sources.map(source => <p key={source} className="text-muted-foreground" data-copilot-source="">{source}</p>)}
          </CollapsibleContent>
        </Collapsible>
        <Button
          type="button" size="sm" variant="ghost" className={cn("shrink-0 rounded-full text-tint", open && "self-start")}
          data-testid="copilot-dismiss"
          onClick={() => { dismiss(); setOpen(false); }}
        >
          OK
        </Button>
      </Alert>
    </div>
  );
}
