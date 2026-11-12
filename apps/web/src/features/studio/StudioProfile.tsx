import { lazy, Suspense } from "react";
import { usePastFlight } from "../../lib/replay/clock";
import { loadProfileChart } from "../plan";
import { alongAt, type ReplayTrack } from "../replay";
import type { Studio } from "./useStudio";

// The nav log's profile (ProfileChart), recharts with it, in its own chunk.
const ProfileChart = lazy(loadProfileChart);

/**
 * The Studio's altitude strip: a replay's altitude across the flight, over
 * the ground under it, its moment marked: the nav log's own profile
 * (ProfileChart), its lines the model's (useStudio's `profile`: the flight
 * flown where the plan would be, broken at each gap, over the planner's
 * elevation tiles; none while they come, the line alone). The replay's
 * clock is read here, a second at a time, so its tick redraws the strip
 * and not the Studio round it.
 */
export function StudioProfile({
  track,
  profile,
  className,
}: {
  track: ReplayTrack;
  profile: NonNullable<Studio["profile"]>;
  className?: string;
}) {
  const second = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at)));
  const now = second === null ? null : alongAt(track.points, second);
  return (
    <div className={className} data-testid="replay-profile">
      <Suspense fallback={<div className="h-full" />}>
        <ProfileChart
          profile={profile.ground}
          plan={profile.flown}
          now={now}
          label="Flown"
          className="aspect-auto h-full w-full [&_text]:[line-height:normal]"
        />
      </Suspense>
    </div>
  );
}
