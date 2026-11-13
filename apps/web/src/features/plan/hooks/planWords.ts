import type { AltitudeSegment } from "../../../lib/api/types";
import type { VerdictItem } from "../../../lib/verdict";
import { grouped } from "../../../lib/format";

/**
 * What the planner's screen says of the plan in words, worked out from
 * the plan's answers with nothing of React in it (usePlanWorkspace):
 * the progress toast's line, a tight leg's caution, and each tab's mark
 * from the Brief's Go / No-Go. Tested as functions (planWords.test.ts).
 */

/** The planner's stage as the progress toast says it: its step, without
 *  the leg, the seconds or what it waits on. */
export function planningWords(stage: string): string {
  if (/checkpoint/i.test(stage)) return "Finding Checkpoints…";
  if (/altitude/i.test(stage)) return "Planning Altitudes…";
  return "Planning…";
}

export function progressWords(navStage: string | null, stage: string | null, briefingLoading: boolean): string | null {
  return (
    (navStage ? planningWords(navStage) : null) ??
    (stage === "navlog" ? "Planning…" : null) ??
    (stage === "course" ? "Drawing Route…" : null) ??
    (stage === "checkpoints" ? "Finding Checkpoints…" : null) ??
    (briefingLoading ? "Fetching Weather…" : null)
  );
}

/** A leg where no 500 ft step fits and the planner flies the highest
 *  whole hundred under its ceiling (wingtip.altitude's tight altitude):
 *  where, at what, and how little room there is either side. */
export function tightLegWords(segments: AltitudeSegment[] | null | undefined): string | null {
  const tight = segments?.find((seg) => seg.tight);
  if (!tight || tight.candidates_ft[0] === undefined || tight.band_ceiling_ft == null) return null;
  const altitude = tight.candidates_ft[0];
  const under =
    tight.band_ceiling_ft === tight.airspace_ceiling_ft
      ? "the Class B"
      : tight.band_ceiling_ft === tight.cloud_ceiling_ft
        ? "the cloud clearance"
        : "the service ceiling";
  const over = Math.round(altitude - tight.floor_ft);
  return (
    `Tight ${Math.round(tight.from_nm)}–${Math.round(tight.to_nm)} nm along: ${grouped(altitude)} ft, ` +
    `${Math.round(tight.band_ceiling_ft - altitude)} ft under ${under} and ` +
    `${over > 0 ? `${over} ft over` : "right at"} the obstacle minimum.`
  );
}

type Mark = "stop" | "caution";

/** Each tab's mark: the worst of its findings on the Brief's Go / No-Go
 *  (lib/verdict), red for something to fix, amber for something to look at. */
export function marksOf(verdict: Pick<VerdictItem, "tab" | "finding">[]): Partial<Record<VerdictItem["tab"], Mark>> {
  const found: Partial<Record<VerdictItem["tab"], Mark>> = {};
  for (const item of verdict) {
    if (item.finding === "stop") found[item.tab] = "stop";
    else if (item.finding === "caution" && !found[item.tab]) found[item.tab] = "caution";
  }
  return found;
}

/** The Brief's own, on its button: the worst of its pages'. */
export function briefMarkOf(marks: Partial<Record<string, Mark>>): Mark | null {
  const all = Object.values(marks);
  return all.includes("stop") ? "stop" : all.includes("caution") ? "caution" : null;
}
