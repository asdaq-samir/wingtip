import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { TEXT } from "../lib/text";

/** A NOTAM's words as the FAA sent them, folded behind a tinted name
 *  (Base UI's Collapsible): monospace, line breaks kept, never rewritten
 *  -- the pilot checks them against the FAA's own. The NOTAM list's line
 *  (NotamLine) and a field's full NOTAM card (PlaceNotams) share it; a
 *  list that sets its line clamp by the fold passes `open`. */
export function NotamAsSent({
  label,
  raw,
  open,
  onOpenChange,
  testId,
}: {
  label: string;
  raw: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The line's test id: the trigger is `${testId}-source`, the text `${testId}-raw`. */
  testId?: string;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger
        className={cn(
          "group relative inline-flex items-center gap-1 self-start font-medium text-tint outline-none after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
          TEXT.note,
        )}
        data-testid={testId ? `${testId}-source` : undefined}
      >
        {label}
        <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* As sent: the FAA's own text, its line breaks kept. */}
        <pre
          className={cn("mt-1 rounded-md bg-muted/60 p-2 font-mono break-words whitespace-pre-wrap", TEXT.note)}
          data-testid={testId ? `${testId}-raw` : undefined}
        >
          {raw}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
