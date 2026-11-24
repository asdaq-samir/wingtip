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
  rule = true,
  wrap = false,
  children,
}: {
  mark?: ReactNode;
  stop: boolean;
  thread?: Thread;
  /** The hairline over its words; none where it is one block with the
   *  row above (a folded procedure's buttons under its head). */
  rule?: boolean;
  /** Its words' controls going under them, at the line's end, where both
   *  do not fit on one line (a section's head and its buttons). */
  wrap?: boolean;
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
      <div
        className={cn(
          "box-content flex min-h-11 min-w-0 flex-1 items-center gap-2",
          wrap && "flex-wrap",
          rule && "border-t border-border",
          TIMELINE_END,
        )}
        data-words=""
      >
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
  startOpen = false,
  foot,
  nest = false,
  chevron = true,
  corner,
  children,
}: {
  head: ReactNode;
  trailing?: ReactNode;
  stop: boolean;
  thread: Thread;
  testId: string;
  label: string;
  data?: Record<string, string | undefined>;
  /** Open at first: the browser specs' fields (useProceduresRoute's
   *  openAtFirst), each worked on whole. */
  startOpen?: boolean;
  /** After its rows, in sight folded too, the line under its head then (a
   *  procedure's buttons; the owner, 2026-11-24: "the next line can be
   *  buttons when folded"). */
  foot?: (open: boolean) => ReactNode;
  /** A phase of the flight (a field's Landing, its Takeoff): no hairline
   *  between the rows in it, only at its head, so it reads as one block
   *  holding them (the owner, 2026-11-24: "No indentation, but no
   *  separator either"). */
  nest?: boolean;
  /** Its chevron; none on a procedure's head, whose "•••" is beside it,
   *  its title the tap that folds it (the owner, 2026-11-24). */
  chevron?: boolean;
  /** A control at the head's bottom right, beside the short line under its
   *  title (an approach's Activate beside its transition), so a long name
   *  keeps its line (the owner, 2026-11-24). */
  corner?: ReactNode;
  children: ReactNode;
}) {
  // Folded at first, its head alone, so opening a field's line shows what
  // it has, not all of it (the owner, 2026-11-24: "Tapping shouldn't
  // unfold all of the subsections"); a tap on a head opens that one.
  const [open, setOpen] = useState(startOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={label} data-testid={testId} data-section-folded={open ? undefined : ""} {...data} />}
    >
      <OnTheLine stop={stop && !open && !foot} thread={thread} wrap={!!trailing}>
        <CollapsibleTrigger
          render={
            <Button
              variant="plain"
              size="inline"
              type="button"
              data-testid="section-fold"
              // At least 11rem for its words, or the line's whole where it
              // is narrower: its controls go under it rather than squeeze a
              // long approach's name to three lines (the owner's iPhone,
              // 2026-11-24, "RNAV (GPS) RWY 05 · FOVOJ" beside Activate).
              className="min-h-11 min-w-[min(100%,11rem)] flex-1 gap-2 py-1.5 text-left font-normal whitespace-normal aria-expanded:bg-transparent pointer-coarse:active:bg-muted"
            />
          }
        >
          <span className="min-w-0 flex-1">{head}</span>
          {chevron && (
            <ChevronDown
              className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-(--motion-fade)", !open && "-rotate-90")}
              aria-hidden
            />
          )}
        </CollapsibleTrigger>
        {trailing && (
          <span className={cn("ml-auto flex max-w-full min-w-0 shrink-0 items-center gap-1", corner && "self-start")}>{trailing}</span>
        )}
        {/* Left of the "•••" column, beside the grey line, so the two never
            meet at a larger text size (the owner's iPhone, 2026-11-24). */}
        {corner && <span className="absolute right-14 bottom-1.5 z-10 flex">{corner}</span>}
      </OnTheLine>
      {/* Base UI's own panel animation, the rows under it moving up as it
          folds (none with Reduce Motion, index.css). */}
      <CollapsibleContent
        className={cn(
          nest && "[&_[data-words]]:border-t-0",
          "h-(--collapsible-panel-height) overflow-hidden [&[data-open]:not([data-starting-style]):not([data-ending-style])]:overflow-visible transition-[height] duration-(--motion-fade) ease-(--motion-sheet-ease) data-ending-style:h-0 data-starting-style:h-0",
        )}
      >
        {children}
      </CollapsibleContent>
      {foot?.(open)}
    </Collapsible>
  );
}

/** A procedure's head as its row says it: its kind's tag in the
 *  procedures' indigo, then its name, "APCH RNAV (GPS) RWY 05 · FOVOJ",
 *  where "(Approach)" after it wrapped the line (the owner, 2026-11-24);
 *  wrapping, never cut. */
export function ProcedureFace({ kind, name, sub }: { kind: string; name: string; sub: string | null }) {
  return (
    <span className="block min-w-0">
      <span className={cn("block font-semibold break-words", TEXT.row)} data-testid="procedure-name">
        {name}
      </span>
      {/* Its transition, or the fix it was sent direct to, then its kind,
          small and grey under it, "FILLZ · Approach", where a tag before
          the name took its line's start (the owner, 2026-11-24). */}
      <span className={cn("block text-muted-foreground", TEXT.note)}>{sub ? `${sub} · ${kind}` : kind}</span>
    </span>
  );
}
