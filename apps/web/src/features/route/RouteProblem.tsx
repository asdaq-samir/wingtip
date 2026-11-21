import { Button } from "../../components/ui/button";
import { wholeNm } from "../../lib/format";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import type { Unflyable } from "../plan";
import { FINDING_TONE } from "../../lib/findings";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * No legal altitude for the route: where along it, why as a list, and the
 * ways on -- a stop to route round the high ground (or an altitude of the
 * pilot's own, the cruising altitude's Custom row beside this). Class B
 * is never what stops it: a route is always planned through it with its
 * clearance (14 CFR 91.131; the owner, 2026-11-17). In the cruising
 * altitude's chip, red, at the pilot's ask (AltitudeGroup): it was a
 * mark beside the Nav Log's title, and before that a line under the
 * route. At rest the route's capsule says so in its chip (PlanWorkspace).
 */
export default function RouteProblem({
  problem,
  onAddStop,
  onGoRound,
}: {
  problem: Unflyable;
  onAddStop: () => void;
  /** The way round high ground the airplane cannot climb over, all its
   *  points put in at once (the planner's detour with `via`). */
  onGoRound?: (via: string[], stopIndex: number) => void;
}) {
  // At the owner's ask ("Suggest a way around the terrain ... Yes build
  // it"): where the airplane's ceiling is what stops it over high ground,
  // the planner's way round, its points named, a tap putting them all in.
  const round = problem.detours.find((d) => d.via && d.via.length > 0);
  return (
    <div className="space-y-3" data-testid="route-problem">
      <p className={cn("font-semibold", FINDING_TONE.stop, TEXT.row)}>{problem.title}</p>
      {problem.reasons.length > 0 && (
        <ul className={cn("list-disc space-y-0.5 pl-4", TEXT.detail)}>
          {problem.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {round && onGoRound ? (
        <div className="space-y-2">
          <p className={cn("text-muted-foreground", TEXT.detail)}>
            By {round.via!.join(", ")} · +{wholeNm(round.added_nm)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => onGoRound(round.via!, round.stop_index)}>
              Go Round the High Ground
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onAddStop} data-testid="unflyable-add-stop">
              {WORDING.addStop}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={onAddStop} data-testid="unflyable-add-stop">
          {WORDING.addStop}
        </Button>
      )}
    </div>
  );
}
