import { cn } from "cn";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { usePastFlight } from "../../lib/replay/clock";
import { blockOf } from "./dataLines";
import type { ReplayTrack } from "./track";

/**
 * A replay's data block over the map, as a reconstruction shows one: the
 * altitude (and what kind it is), the ground speed, the vertical speed,
 * the track over the ground (ADS-B sends the track, not the heading: the
 * wind's drift between the two is not known) and the time in Zulu. In a
 * gap it says so, and from when to when, rather than figures it does not
 * have.
 */
export function DataBlock({ track, className }: { track: ReplayTrack; className?: string }) {
  const second = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at)));
  // Inside the flight: the clock's whole second can fall a moment before
  // its first report.
  const first = track.points[0]?.t ?? 0,
    last = track.points.at(-1)?.t ?? first;
  const t = Math.min(last, Math.max(first, second ?? first));
  const { time, gap, rows } = blockOf(track, t);
  return (
    <div
      className={cn(GLASS, "pointer-events-none flex min-w-36 flex-col gap-0.5 rounded-(--radius-card) px-3 py-2 tabular-nums", className)}
      data-testid="replay-data-block"
      role="status"
    >
      <span className={cn("font-semibold", TEXT.row)} data-testid="replay-data-time">
        {time}
      </span>
      {gap ? (
        <span className={cn("text-muted-foreground", TEXT.note)} data-testid="replay-data-gap">
          {gap}
        </span>
      ) : (
        rows.map(([name, value, id]) => (
          <span key={id} className={cn("flex justify-between gap-3", TEXT.note)}>
            <span className="text-muted-foreground">{name}</span>
            <span className="font-semibold" data-testid={`replay-data-${id}`}>
              {value}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
