import type { Fold } from "./ProcedureDropdown";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { TEXT } from "../../lib/text";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";
import { WIDE_PILL } from "./routeListStyle";

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
 * the head's end (a missed approach's Unsuspend, an approach's Activate).
 * A procedure picked is a pill as wide as the card instead (`pill`, the
 * owner, 2026-11-25): its words open its menu, its chevron folds its fixes.
 * Folded, the route's line stops at the head where it would have ended at
 * the section's last row.
 */
export function FoldSection({
  head,
  pill,
  trailing,
  stop,
  thread,
  testId,
  label,
  data,
  startOpen = false,
  chevron = true,
  children,
}: {
  head?: ReactNode;
  /** Its pill, the menu's trigger (ProcedureTrigger's `wide`), in place
   *  of the head: its menu shows or hides the fixes (ProcedureDropdown's
   *  `fold`), the pill with no chevron of its own. */
  pill?: (fold: Fold) => ReactNode;
  trailing?: ReactNode;
  stop: boolean;
  thread: Thread;
  testId: string;
  label: string;
  data?: Record<string, string | undefined>;
  /** Open at first: the browser specs' fields (useProceduresRoute's
   *  openAtFirst), each worked on whole. */
  startOpen?: boolean;
  /** Its chevron; none where its title is the tap that folds it. */
  chevron?: boolean;
  children: ReactNode;
}) {
  // Folded at first, its head alone, so opening a field's line shows what
  // it has, not all of it (the owner, 2026-11-24: "Tapping shouldn't
  // unfold all of the subsections"); a tap on a head opens that one.
  const [open, setOpen] = useState(startOpen);
  const turn = cn("shrink-0 text-muted-foreground transition-transform duration-(--motion-fade)", !open && "-rotate-90");
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={label} data-testid={testId} data-section-folded={open ? undefined : ""} {...data} />}
    >
      <OnTheLine stop={stop && !open} thread={thread}>
        {pill ? (
          <span className={WIDE_PILL}>
            {pill({ open, set: setOpen })}
            {trailing}
          </span>
        ) : (
          <>
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
              {chevron && <ChevronDown className={cn(turn, "size-5")} aria-hidden />}
            </CollapsibleTrigger>
            {trailing && <span className="ml-auto flex max-w-full min-w-0 shrink-0 items-center gap-1">{trailing}</span>}
          </>
        )}
      </OnTheLine>
      {/* Base UI's own panel animation, the rows under it moving up as it
          folds (none with Reduce Motion, index.css). */}
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden [&[data-open]:not([data-starting-style]):not([data-ending-style])]:overflow-visible transition-[height] duration-(--motion-fade) ease-(--motion-sheet-ease) data-ending-style:h-0 data-starting-style:h-0">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A field's Landing or Takeoff in its card (PhaseCards): one line, its
 * mark on the route's line, its title, then its pills -- its runway's and
 * a kind's "+ ARR" not yet picked, slim, each opening its menu -- and a
 * stop's leaving time at the end (the owner, 2026-11-25: "landing or
 * takeoff should have pills in front of the title"), then each procedure
 * picked, a pill as wide as the card. It does not fold: each procedure
 * folds its own fixes. No hairline between its rows, so it reads as one
 * block (the owner, 2026-11-24: "No indentation, but no separator either").
 */
export function PhaseSection({
  mark,
  title,
  pills,
  time,
  thread,
  testId,
  label,
  phase,
  children,
}: {
  mark: ReactNode;
  title: string;
  pills: ReactNode;
  time?: ReactNode;
  thread: Thread;
  testId: string;
  label: string;
  phase: "Arrive" | "Depart";
  children: ReactNode;
}) {
  return (
    <section aria-label={label} data-testid={testId}>
      <OnTheLine mark={mark} stop={false} thread={thread} wrap>
        <span className={cn("shrink-0 py-2.5 font-semibold", TEXT.row)}>{title}</span>
        {/* Its pills 8 apart, their 44s meeting (gap-2), wrapping under the
            first where they do not all fit. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-2.5" data-testid="timeline-chips" data-role={phase}>
          {pills}
        </span>
        {time && <span className="ml-auto flex shrink-0 items-center">{time}</span>}
      </OnTheLine>
      <div className="[&_[data-words]]:border-t-0">{children}</div>
    </section>
  );
}

/** A procedure's head as its row says it: its kind's tag in the
 *  procedures' indigo, then its name, "APCH RNAV (GPS) RWY 05 · FOVOJ",
 *  where "(Approach)" after it wrapped the line (the owner, 2026-11-24);
 *  wrapping, never cut. */
export function ProcedureFace({
  kind,
  name,
  sub,
  testId = "procedure-name",
}: {
  kind: string;
  name: string;
  sub: string | null;
  testId?: string;
}) {
  return (
    <span className="block min-w-0">
      <span className={cn("block font-semibold break-words", TEXT.row)} data-testid={testId}>
        {name}
      </span>
      {/* Its transition, or the fix it was sent direct to, then its kind,
          small and grey under it, "FILLZ · Approach", where a tag before
          the name took its line's start (the owner, 2026-11-24). */}
      <span className={cn("block text-muted-foreground", TEXT.note)}>{sub ? `${sub} · ${kind}` : kind}</span>
    </span>
  );
}

/** The route's magenta on through a gap between a field's line and its
 *  cards, or between the two, in the marks' column, a point over each
 *  card's edge so it runs on unbroken; `on` into the next field's row as
 *  far as a row's own line runs (TIMELINE_THREAD's 12). */
function Gap({ line, on = false }: { line: boolean; on?: boolean }) {
  return (
    <div className="relative h-2">
      {line && (
        <span
          aria-hidden="true"
          className={cn("absolute -top-px left-4 -translate-x-1/2 border-l-[3px] border-course", on ? "-bottom-3" : "-bottom-px")}
        />
      )}
    </div>
  );
}

/**
 * A field's Landing and Takeoff, each a card of its own under the field's
 * line, as wide as the field's rows, the route's magenta straight down
 * through them in the marks' column (the owner, 2026-11-24: "two cards
 * within airport id, one for landing and another for takeoff"; "Maybe we
 * can make them not indented but as wide as the airport cards? So the
 * magenta line connects straight down?"). `into` where the line goes on
 * into them, `out` where it goes on past them to the next field.
 */
/** A phase's mark on the route's line, Landing's or Takeoff's glyph in a
 *  disc of the list's colour, so the line runs through each phase as it
 *  runs through each field (the redesign of 2026-11-25). */
export function PhaseMark({ icon }: { icon: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 place-items-center rounded-full bg-card text-procedure shadow-xs ring-1 ring-border [&_svg]:size-4"
    >
      {icon}
    </span>
  );
}

export function PhaseCards({ landing, takeoff, into, out }: { landing: ReactNode; takeoff: ReactNode; into: boolean; out: boolean }) {
  // The stock Card (shadcn's), its padding, gap and shadow off: its rows
  // are the list's own. Filled, not outlined, iOS's grouped cell inside the
  // list (the redesign of 2026-11-25: an outline inside the outlined list
  // read as a box in a box). Out 8 past the marks' column and in 8 from
  // the list's edge (7 inside its 1-point edge, now clear), so its marks
  // keep the field's column, the line unbroken, and its corners show; its
  // first row has no hairline over it, its rows 12 from its end.
  const card =
    "relative -ml-2 mr-2 gap-0 border-transparent bg-muted/60 py-0 pl-[7px] shadow-none [&_[data-words]]:pr-3 [&>section>div:first-child>[data-words]]:border-t-0";
  return (
    <div data-testid="phase-cards">
      <Gap line={into} />
      {landing && <Card className={card}>{landing}</Card>}
      {landing && takeoff && <Gap line={into} />}
      {takeoff && <Card className={card}>{takeoff}</Card>}
      <Gap line={out} on />
    </div>
  );
}
