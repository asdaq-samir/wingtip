import type { ReactNode } from "react";
import { PlaneLanding, PlaneTakeoff, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleTrigger } from "../../components/ui/collapsible";
import type { ProcedureAirport } from "../plan";
import { TRAY_HEAD } from "./RunwayChips";
import { useOpenRunwayLines, type ProceduresRouteModel } from "./useProceduresRoute";
import type { FieldPart } from "./fieldParts";

/** A landing's or a takeoff's tray in a field's step: its glyph and its
 *  runway chips (FieldStep's partBody). */
function RunwayTray({
  a,
  role,
  Glyph,
  lineKey,
  foldable,
  lineOpen,
  chips,
}: {
  a: ProcedureAirport;
  role: "Arrive" | "Depart";
  Glyph: LucideIcon;
  lineKey: string;
  foldable: boolean;
  lineOpen: boolean;
  /** The runway chips, with the pull-downs after them as their trailing part. */
  chips: ReactNode;
}) {
  // The glyph and its runways one tray, at the owner's pick of the canvas (2026-10-27, G2, artifact
  //  JMQabZH2W33kzmvUuahbad): the landing's or the takeoff's glyph at its head, the runway picked after it
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
      onOpenChange={(next) =>
        useOpenRunwayLines.setState((st) => ({ open: next ? [...st.open, lineKey] : st.open.filter((k) => k !== lineKey) }))
      }
      render={<div className="flex min-w-0 flex-1 items-start" />}
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
              aria-label={lineOpen ? `${a.ident}: fold the runways` : `${a.ident}: all the runways`}
              className={cn("justify-start text-inherit", TRAY_HEAD, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            />
          }
        >
          <Glyph className="size-5" aria-hidden />
        </CollapsibleTrigger>
      ) : (
        <span className={cn(TRAY_HEAD, a.runways?.length === 0 && "rounded-r-full")}>
          <Glyph className="size-5" aria-label={role === "Arrive" ? "landing" : "takeoff"} role="img" />
        </span>
      )}
      <div className={cn("min-w-0 flex-1", a.runways?.length === 0 && "pl-2")}>{chips}</div>
    </Collapsible>
  );
}

/** A part's tray: its glyph and runway chips (RunwayTray), what follows
 *  them (`trailing`, the kinds' pull-downs) and, for a stop's takeoff,
 *  when it leaves again. */
export function PartTray({
  vm,
  a,
  part,
  trailing,
}: {
  vm: ProceduresRouteModel;
  a: ProcedureAirport;
  part: FieldPart;
  trailing: ReactNode[];
}) {
  // The line folds to its runway once one is picked; the pull-downs beside
  // the runway's chip while it is folded, at the owner's ask ("Can arrival
  // and approach pills be next to the runway when runway is collapsed?").
  const foldable = part.line.chosen !== null && a.runways !== null;
  return (
    <div className="flex items-center gap-2" data-testid="field-part" data-role={part.role}>
      <RunwayTray
        a={a}
        role={part.role}
        Glyph={part.role === "Arrive" ? PlaneLanding : PlaneTakeoff}
        lineKey={part.line.key}
        foldable={foldable}
        lineOpen={vm.openLines.includes(part.line.key)}
        chips={part.chips(trailing.length > 0 ? trailing : null)}
      />
      {part.leaves && <span className="shrink-0">{part.leaves}</span>}
    </div>
  );
}
