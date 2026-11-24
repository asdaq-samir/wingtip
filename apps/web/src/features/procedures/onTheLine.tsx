import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { TEXT } from "../../lib/text";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";

/** How the route's magenta runs through a row: solid where it is flown,
 *  dashed where it is not flown yet (an approach loaded, not activated; a
 *  missed approach suspended; the owner, 2026-11-24: "maybe a dashed line
 *  when not activated"), none where the route has ended above it. */
export type Thread = "solid" | "dashed" | "none";

/** A row on the route's line: its mark (none for a section's head) in
 *  the marks' column, the route's magenta through it from top to bottom
 *  and on into the next row -- to the mark's middle on the route's last
 *  row (`stop`) -- and its words after the inset hairline. */
export function OnTheLine({
  mark,
  stop,
  thread = "solid",
  children,
}: {
  mark?: ReactNode;
  stop: boolean;
  thread?: Thread;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative flex", TIMELINE_GAP)} data-thread={thread}>
      <span className="relative flex w-8 shrink-0 items-center justify-center self-stretch">
        {thread !== "none" && (
          <span aria-hidden="true" className={cn(TIMELINE_THREAD, "top-0", stop && "bottom-1/2", thread === "dashed" && "border-dashed")} />
        )}
        {mark && <span className="relative z-10 flex">{mark}</span>}
      </span>
      {/* 44 points under its hairline, as a point's line is (TimelineLine's
          row under its border): with the border inside the 44 a fix's
          button was 43 tall (the HIG review's P1, 2026-11-21). */}
      <div className={cn("box-content flex min-h-11 min-w-0 flex-1 items-center gap-2 border-t border-border", TIMELINE_END)}>
        {children}
      </div>
    </div>
  );
}

/**
 * One section of a field's group on FPL's list, under the field's line as
 * its heading (the owner, 2026-11-24: "that airport should be the heading
 * and than it should have the folding runways and folding procedures
 * inside"): its head a stock Collapsible's trigger, a tap folding its rows
 * away under it and back, its chevron turning to say which; `trailing` at
 * the head's end (a procedure's menu, a missed approach's Unsuspend).
 * Folded, the route's line stops at the head where it would have ended at
 * the section's last row.
 */
export function FoldSection({
  head,
  trailing,
  stop,
  thread,
  testId,
  label,
  data,
  children,
}: {
  head: ReactNode;
  trailing?: ReactNode;
  stop: boolean;
  thread: Thread;
  testId: string;
  label: string;
  data?: Record<string, string | undefined>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={label} data-testid={testId} data-folded={open ? undefined : ""} {...data} />}
    >
      <OnTheLine stop={stop && !open} thread={thread}>
        <CollapsibleTrigger
          render={
            <Button
              variant="plain"
              size="inline"
              type="button"
              data-testid="section-fold"
              className="min-h-11 min-w-0 flex-1 gap-2 py-1.5 text-left font-normal whitespace-normal aria-expanded:bg-transparent pointer-coarse:active:bg-muted"
            />
          }
        >
          <span className="min-w-0 flex-1">{head}</span>
          <ChevronDown
            className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-(--motion-fade)", !open && "-rotate-90")}
            aria-hidden
          />
        </CollapsibleTrigger>
        {trailing}
      </OnTheLine>
      {/* Base UI's own panel animation, the rows under it moving up as it
          folds (none with Reduce Motion, index.css). */}
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--motion-fade) ease-(--motion-sheet-ease) data-ending-style:h-0 data-starting-style:h-0">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A section's head as its row says it: its kind in the procedure's
 *  indigo, small capitals ("APPROACH"; the field is the group's heading),
 *  over its name, wrapping, never cut. */
export function ProcedureFace({ word, name }: { word: string; name: string }) {
  return (
    <>
      <span className={cn("block font-semibold tracking-wide text-procedure uppercase", TEXT.note)}>{word}</span>
      {/* Wrapping, never cut: all of the name at any text size. */}
      <span className={cn("block font-semibold break-words", TEXT.row)} data-testid="procedure-name">
        {name}
      </span>
    </>
  );
}
