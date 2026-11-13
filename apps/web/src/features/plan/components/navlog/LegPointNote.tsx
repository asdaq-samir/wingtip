import { AskFigure } from "../../../../components/airplane/AskFigure";
import type { TopOfClimb, TopOfDescent } from "../../../../lib/api/types";
import { feet } from "../../../../lib/format";

/** What a top of climb or descent's row says under it: the level, or the
 *  rate down and what to. A descent the airplane has no descent speed or
 *  fuel flow for is flown on the cruise's figures (the engine's
 *  descent_phase, `descent_at_cruise`): the row says so, and asks for them
 *  where they are needed (AskFigure; the owner, 2026-11-09: ask, never
 *  assume). */
export function LegPointNote({ point, descent }: { point: TopOfClimb | TopOfDescent; descent: TopOfDescent | null }) {
  if (!descent) return <>{`Top of climb: level at ${feet(point.altitude_ft)}.`}</>;
  const to = descent.pattern ? ", the pattern" : descent.fix ? ` by ${descent.fix}, the approach's first fix` : "";
  const words = `Top of descent: ${descent.fpm} fpm down to ${feet(descent.to_ft)}${to}.`;
  if (!descent.descent_at_cruise) return <>{words}</>;
  return (
    <span className="flex flex-col gap-2">
      <span>{`${words} Flown at the cruise's speed and fuel flow, for want of the airplane's descent figures.`}</span>
      <AskFigure figure="descent" what="The descent" testId="descent-ask" />
    </span>
  );
}
