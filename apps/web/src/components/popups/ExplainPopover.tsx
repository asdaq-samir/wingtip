import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { EXPLAINED, type ExplainedTerm } from "../../lib/explain";
import { TEXT } from "../../lib/text";

/** Explain's popover (components/Explain), on the popups' chunk: the word
 *  the stock Popover's button, the popover its whole name, one plain
 *  sentence and where it comes from (lib/explain). */
export function ExplainPopover({
  term,
  trigger,
  defaultOpen,
  children,
}: {
  term: ExplainedTerm;
  /** The trigger's look, name and keys, Explain's own. */
  trigger: ComponentProps<typeof PopoverTrigger>;
  /** Opened at once: tapped while the chunk was on its way. */
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const what = EXPLAINED[term];
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger {...trigger}>{children}</PopoverTrigger>
      <PopoverContent className="w-72 gap-1.5" data-testid="explain-popover">
        <p className={cn("font-semibold text-foreground", TEXT.row)}>{what.name}</p>
        <p className={cn("text-foreground", TEXT.detail)}>{what.sentence}</p>
        <p className={cn("text-muted-foreground", TEXT.note)}>{what.source}</p>
      </PopoverContent>
    </Popover>
  );
}
