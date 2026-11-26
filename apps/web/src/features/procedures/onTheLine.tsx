import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { TEXT } from "../../lib/text";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";
import { WIDE_PILL } from "./routeListStyle";
import { LineRoom, useLineRoom } from "./lineRoom";

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
 * away under it and back; `trailing` at the head's end (a missed
 * approach's Unsuspend, an approach's Activate). A procedure picked is a
 * pill as wide as the card instead (`pill`, the owner, 2026-11-25): a tap
 * on it folds its fixes, the chip at its end opens its menu.
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
  children,
}: {
  head?: ReactNode;
  /** Drawn as a pill as wide as the card: the head the tap that folds it,
   *  then `trailing`, then this at its right end, the menu's chip
   *  (ProcedureTrigger's `wide`; the owner, 2026-11-25: "Tapping the pill
   *  should fold/unfold. And the button at the end can be used for
   *  selection"). */
  pill?: ReactNode;
  trailing?: ReactNode;
  stop: boolean;
  thread: Thread;
  testId: string;
  label: string;
  data?: Record<string, string | undefined>;
  /** Open at first: the browser specs' fields (useProceduresRoute's
   *  openAtFirst), each worked on whole. */
  startOpen?: boolean;
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
      render={
        <section
          aria-label={label}
          data-testid={testId}
          data-section-folded={open ? undefined : ""}
          className={cn(pill && "relative", pill && open && "mb-1.5 pb-1.5")}
          {...data}
        />
      }
    >
      {/* Unfolded, the pill grows into a card round its fixes (the owner,
          2026-11-25: "Can the pills expand to a card when showing fixes?"):
          one hairline outline from the pill's top round every fix's words,
          its corners the pill's own, the route's dots left of it on the
          line. Over the words' column only: the marks' 32 and their 16 gap
          (w-8, TIMELINE_GAP) to its left, the card's 12 (PhaseCards' pr-3)
          to its right, as the pill is. */}
      {pill && open && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-3 bottom-0 left-12 rounded-(--radius-card) ring-1 ring-foreground/12 ring-inset"
        />
      )}
      <OnTheLine stop={stop && !open} thread={thread}>
        {pill ? (
          <span className={cn(WIDE_PILL, open && "ring-0")}>
            <CollapsibleTrigger
              render={
                <Button
                  variant="plain"
                  size="inline"
                  type="button"
                  data-testid="section-fold"
                  aria-label={`${label}: ${open ? "hide" : "show"} its fixes`}
                  className="relative h-9 min-w-0 flex-1 justify-start rounded-full pl-3 text-left font-normal hit-y-1 aria-expanded:bg-transparent pointer-coarse:active:bg-muted"
                />
              }
            >
              {head}
            </CollapsibleTrigger>
            {trailing}
            {pill}
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
            </CollapsibleTrigger>
            {trailing && <span className="ml-auto flex max-w-full min-w-0 shrink-0 items-center gap-1">{trailing}</span>}
          </>
        )}
      </OnTheLine>
      {/* Base UI's own panel animation, the rows under it moving up as it
          folds (none with Reduce Motion, index.css). Clipped while it
          grows and from the first frame it shrinks, open to the route's
          line past its foot only once grown: overflow, a discrete
          property, turns visible a fold's time after it opens. Base UI
          marks only the first frame (data-starting-style), so the fixes
          were drawn whole over the Takeoff row under them while the room
          for them grew (the owner's iPhone recording, 2026-11-26). */}
      <CollapsibleContent
        className={cn(
          // Inside the card the fixes' words are inset 12 from its sides,
          // each row 40 tall, its tap 44 (TimelineProcedureRows' hit-y-0.5;
          // the owner, 2026-11-25: "Go ahead", rows of 48 for a name and
          // an altitude).
          pill && "[&_[data-words]]:min-h-10 [&_[data-words]]:pl-3 [&_[data-words]]:pr-6!",
          "h-(--collapsible-panel-height) overflow-hidden [transition:height_var(--motion-fade)_var(--motion-sheet-ease),overflow_0s_var(--motion-fade)] [transition-behavior:allow-discrete] [&[data-open]:not([data-starting-style]):not([data-ending-style])]:overflow-visible data-ending-style:h-0 data-ending-style:[transition:height_var(--motion-fade)_var(--motion-sheet-ease),overflow_0s] data-starting-style:h-0",
        )}
      >
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
  // "RWY" before its runway while its line has room (useLineRoom).
  const [roomy, measure] = useLineRoom();
  return (
    <section aria-label={label} data-testid={testId}>
      <OnTheLine mark={mark} stop={false} thread={thread} wrap>
        <span className={cn("shrink-0 py-2.5 font-semibold", TEXT.row)}>{title}</span>
        {/* Its pills 6 apart (the owner, 2026-11-25: tighter, so a field's
            pills keep the title's line; their areas are 44 tall, hit-y,
            not wide, so none overlap), wrapping under the
            first where they do not all fit. */}
        <span
          ref={measure}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-2.5"
          data-testid="timeline-chips"
          data-role={phase}
        >
          <LineRoom.Provider value={roomy}>{pills}</LineRoom.Provider>
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

/**
 * A field's Landing and Takeoff, each a card of its own under the field's
 * line, as wide as the field's rows, the route's magenta straight down
 * through them in the marks' column (the owner, 2026-11-24: "two cards
 * within airport id, one for landing and another for takeoff"; "Maybe we
 * can make them not indented but as wide as the airport cards? So the
 * magenta line connects straight down?"). `into` where the line goes on
 * into them, `out` where it goes on past them to the next field.
 */
export function PhaseCards({ landing, takeoff, into, out }: { landing: ReactNode; takeoff: ReactNode; into: boolean; out: boolean }) {
  // The stock Card (shadcn's), its padding, gap and shadow off: its rows
  // are the list's own. No fill (the owner, 2026-11-25: "Go ahead", of the
  // grey card, the procedure's outlined card and its chip three boxes
  // deep): each procedure's own outline groups it, the phase its title
  // line and mark. Out 8 past the marks' column, so its marks keep the
  // field's column and the line is unbroken, and to the list's edge, its
  // rows 12 from it, the procedures' cards 8 wider than in the grey one;
  // its first row has no hairline over it.
  const card =
    "relative -ml-2 gap-0 border-0 bg-transparent py-0 pl-2 shadow-none [&_[data-words]]:pr-3 [&>section>div:first-child>[data-words]]:border-t-0";
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
