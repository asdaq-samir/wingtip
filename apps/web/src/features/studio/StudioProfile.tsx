import { lazy, Suspense, useMemo } from "react";
import { usePastFlight } from "../../lib/replay/clock";
import { loadProfileChart } from "../plan";
import { alongAt, type ReplayTrack } from "../replay";

// The nav log's profile (ProfileChart), recharts with it, in its own chunk.
const ProfileChart = lazy(loadProfileChart);

/** The flown altitude down to the profile's points: one each half
 *  minute of the flight is enough for a strip a phone wide. */
const MOST_POINTS = 600;

/**
 * The Studio's altitude strip: a replay's altitude across the flight, over the ground under it, its
 * moment marked: the nav log's own profile (ProfileChart), with the
 * flight flown where the plan would be, broken at each gap. `ground` is
 * the ground's height under the track (the planner's elevation tiles),
 * along it; none while it comes, the line alone.
 */
export function StudioProfile({
  track,
  ground,
  className,
}: {
  track: ReplayTrack;
  ground: { along_nm: number; ground_ft: number }[];
  className?: string;
}) {
  const second = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at)));
  const line = useMemo(() => {
    const step = Math.max(1, Math.ceil(track.points.length / MOST_POINTS));
    const points = track.points.flatMap((p, i) => {
      // A gap: a break before the report after it. On the ground no
      // altitude is sent, and none is drawn.
      const brk = p.gap ? [{ along_nm: p.along_nm, plan_ft: null }] : [];
      const kept = p.alt_ft != null && (i % step === 0 || p.gap || i === track.points.length - 1);
      return kept ? [...brk, { along_nm: p.along_nm, plan_ft: p.alt_ft! }] : brk;
    });
    return { length_nm: track.lengthNm, points, marks: [] };
  }, [track]);
  const profile = useMemo(() => ({ length_nm: track.lengthNm, terrain: ground, airspace: [], obstacles: [] }), [track.lengthNm, ground]);
  const now = second === null ? null : alongAt(track.points, second);
  return (
    <div className={className} data-testid="replay-profile">
      <Suspense fallback={<div className="h-full" />}>
        <ProfileChart
          profile={profile}
          plan={line}
          now={now}
          label="Flown"
          className="aspect-auto h-full w-full [&_text]:[line-height:normal]"
        />
      </Suspense>
    </div>
  );
}
