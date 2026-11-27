import type { ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleTrigger } from "../../components/ui/collapsible";
import type { ProcedureAirport } from "../plan";
import { TRAY_HEAD } from "./RunwayChips";
import { setRunwayLine } from "./fieldsOpen";
import type { RouteListSlice } from "./useProceduresRoute";
import type { FieldPart } from "./fieldParts";

/** The tray's head: what the runway is for and "RWY", the FAA's
 *  contraction (FAA Order JO 7340.2), "Land RWY" or "Takeoff RWY", so the
 *  tray reads "Land RWY 24" (the owner's option D, 2026-11-21; it was
 *  "RWY" alone, 2026-11-17: "instead of the landing glyph, just use RWY");
 *  a reader hears which it is, a landing's or a takeoff's. */
function RunwayWord({ role }: { role: "Arrive" | "Depart" }) {
  return (
    <span role="img" aria-label={role === "Arrive" ? "landing" : "takeoff"} className={cn(TEXT.detail, "font-semibold whitespace-nowrap")}>
      {role === "Arrive" ? "Land" : "Takeoff"} RWY
    </span>
  );
}

/** A landing's or a takeoff's tray in a field's step: its head (RunwayWord)
 *  and its runway chips (FieldStep's partBody). */
function RunwayTray({
  a,
  role,
  lineKey,
  foldable,
  lineOpen,
  chips,
}: {
  a: ProcedureAirport;
  role: "Arrive" | "Depart";
  lineKey: string;
  foldable: boolean;
  lineOpen: boolean;
  /** The runway chips, with the pull-downs after them as their trailing part. */
  chips: ReactNode;
}) {
  const folded = foldable && !lineOpen && !!a.runways?.length;
  // The head and its runways one tray, at the owner's pick of the canvas (2026-10-27, G2, artifact
  //  JMQabZH2W33kzmvUuahbad): "RWY" at its head (RunwayWord; it was the landing's or the takeoff's glyph), the runway picked after it
  //  with its arrow while it is folded, every runway in it while it is open. The head is the line's button
  //  where it folds, a tap on it opening or folding it, as a tap on the runway picked opens it; it was a
  //  small arrow after the glyph ("the arrow next to runway can be next to the depart/arrive symbol"). The
  //  pull-downs follow the tray, sliding with the runways (the owner's "Approach doesn't need to go next line
  //  just let it slide with runways"). Its head level with the runways' line, not the middle of two where the
  //  pull-downs wrap under it (the owner's screenshot, 2026-10-27, the head between "12" and "+ Arrival").
  //  The tray a stock Collapsible, open while its runways are out: the head its trigger, and the line of
  //  runways (PatternChips) its content. Its open state stays the page's (useOpenRunwayLines), as the list is
  //  drawn again as the sheet moves.
  return (
    <Collapsible
      open={foldable && lineOpen}
      onOpenChange={(next) => setRunwayLine(lineKey, next)}
      // As wide as its chips, sharing its line with a stop's leaving time
      // where both fit (PartTray). Folded, the runway picked and the
      // pull-downs are laid out in this row itself (PatternChips' folded
      // line, `contents`), wrapping from its leading edge.
      render={<div className={cn("flex min-w-0 flex-auto items-start", folded && "flex-wrap gap-y-3")} />}
    >
      {foldable ? (
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="inline"
              type="button"
              data-testid="runway-line-toggle"
              data-disclosure=""
              // Its name starts with the "Land RWY" it shows (WCAG 2.5.3, Label in Name: a
              // voice user says what they see), then the field and what a tap does.
              aria-label={`${role === "Arrive" ? "Land" : "Takeoff"} RWY, ${a.ident}: ${lineOpen ? "fold the runways" : "all the runways"}`}
              className={cn("justify-start text-inherit", TRAY_HEAD, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            />
          }
        >
          <RunwayWord role={role} />
        </CollapsibleTrigger>
      ) : (
        <span className={cn(TRAY_HEAD, a.runways?.length === 0 && "rounded-r-full")}>
          <RunwayWord role={role} />
        </span>
      )}
      <div className={cn(folded ? "contents" : "min-w-0 flex-1", a.runways?.length === 0 && "pl-2")}>{chips}</div>
    </Collapsible>
  );
}

/** A part's tray: its head and runway chips (RunwayTray), what follows
 *  them (`trailing`, the kinds' pull-downs) and, for a stop's takeoff,
 *  when it leaves again. */
export function PartTray({
  vm,
  a,
  part,
  trailing,
}: {
  vm: RouteListSlice<"openLines">;
  a: ProcedureAirport;
  part: FieldPart;
  trailing: ReactNode[];
}) {
  // The line folds to its runway once one is picked; the pull-downs beside
  // the runway's chip while it is folded, at the owner's ask ("Can arrival
  // and approach pills be next to the runway when runway is collapsed?").
  const foldable = part.line.chosen !== null && a.runways !== null;
  return (
    // The row's width and no wider (FPL's chips row wraps): sized to its
    // runways and pull-downs it ran past the card, and a slide on the open
    // tray panned the whole sheet sideways (the owner's screenshot,
    // 2026-11-17), where they are to slide inside the tray's own scroller.
    // The leaving time on a line of its own, at the right, where it does
    // not fit beside the tray: at the owner's 19.65 px on a 375-point
    // phone KMSN's "22:11" ran past the card's edge, cut to "22:1" (the HIG
    // review, 2026-11-21).
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2" data-testid="field-part" data-role={part.role}>
      <RunwayTray
        a={a}
        role={part.role}
        lineKey={part.line.key}
        foldable={foldable}
        lineOpen={vm.openLines.includes(part.line.key)}
        chips={part.chips(trailing.length > 0 ? trailing : null)}
      />
      {/* When it leaves again at the line's right, under the landing's time
          (the owner, 2026-11-20: "11:33 can be right aligned"). */}
      {part.leaves && <span className="ml-auto shrink-0">{part.leaves}</span>}
    </div>
  );
}
