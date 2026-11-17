import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Check, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ListRow } from "./GroupedList";
import { TEXT } from "../lib/text";

/**
 * One of the card's four rows: its name at the left, where it stands at the right, a control of its own
 * beside it (a microphone, Use This Route) and its detail folded under, opened by a tap on the row (shadcn's
 * Collapsible on a ListRow, as the airport card folds its fuel remarks). The row's own height is its hit
 * area (a ListRow is 44 at the least); the control beside it gets its 44 from a pseudo-element.
 */
export function Step({
  id,
  title,
  state,
  open,
  onOpenChange,
  control,
  children,
}: {
  id: string;
  title: string;
  state: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 pr-2">
        <CollapsibleTrigger
          render={
            <ListRow
              title={title}
              value={<span data-testid={`clearance-state-${id}`}>{state}</span>}
              chevron
              data-testid={`clearance-row-${id}`}
              className="min-w-0 flex-1"
            />
          }
        />
        {control}
      </div>
      <CollapsibleContent className={cn("flex flex-col gap-2 px-3 pb-3", TEXT.detail)} data-testid={`clearance-detail-${id}`}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A tick for what was read back or matches, a mark for what was not,
 *  each named for VoiceOver as the iPhone names them. */
export function Verdict({ ok, said, children }: { ok: boolean; said: [ok: string, notOk: string]; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2", !ok && "text-caution-ink")}>
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-go-ink" aria-label={said[0]} />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-label={said[1]} />
      )}
      <span>{children}</span>
    </div>
  );
}

/** "Not yet" in a row that has nothing to say. */
export function NotYet() {
  return <span className="text-muted-foreground">Not yet</span>;
}
