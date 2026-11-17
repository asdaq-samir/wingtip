import type { ReactNode } from "react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { EXPLAINED, type ExplainedTerm } from "../lib/explain";
import { TEXT } from "../lib/text";

/**
 * An abbreviation or a figure's name that says what it means when tapped
 * (the FPL redesign, the owner 2026-11-17): the word itself is the stock
 * Popover's button, in the tint as everything tappable is, and the
 * popover its whole name, one plain sentence and where it comes from
 * (lib/explain). No label is added beside it, so the screen reads as it
 * did. A tap on it is its own, never the row's under it.
 */
export default function Explain({
  term,
  children,
  spoken,
  className,
}: {
  term: ExplainedTerm;
  children?: ReactNode;
  /** Its whole name for a screen reader where the word stands alone (a
   *  column's heading, "Magnetic heading"). */
  spoken?: string;
  className?: string;
}) {
  const what = EXPLAINED[term];
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          // A 44-point area up and down by a pseudo-element, the word's own
          // size unchanged (decision 0030).
          "relative inline cursor-help rounded-sm text-tint outline-none after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label={`${spoken ?? children ?? term}: what it means`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        data-testid={`explain-${term.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {children ?? term}
      </PopoverTrigger>
      <PopoverContent className="w-72 gap-1.5" data-testid="explain-popover">
        <p className={cn("font-semibold text-foreground", TEXT.row)}>{what.name}</p>
        <p className={cn("text-foreground", TEXT.detail)}>{what.sentence}</p>
        <p className={cn("text-muted-foreground", TEXT.note)}>{what.source}</p>
      </PopoverContent>
    </Popover>
  );
}
