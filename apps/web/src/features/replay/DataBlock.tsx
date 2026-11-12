import { cn } from "cn";
import { GLASS } from "../../lib/mapChrome";
import { altFt, grouped } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { usePastFlight } from "../../lib/replay/clock";
import { replayTimes } from "./replayTime";
import { gapAt, sampleAt, type AltitudeKind, type ReplayTrack } from "./track";

/** What the altitude figure is, said beside it: a transponder's
 *  pressure altitude is not what an altimeter set to the local setting
 *  read (AIM 7-2-2), nor is a GPS's height. */
const ALT_NAME: Record<AltitudeKind, string> = { pressure: "Press alt", reported: "Altitude", gps: "GPS alt" };

/** The figures of a moment: each rounded as a data block rounds it. */
function figures(track: ReplayTrack, t: number) {
  const here = sampleAt(track.points, t);
  if (!here) return null;
  const vs = here.vs_fpm;
  return {
    alt: here.ground ? "Ground" : `${altFt(here.alt_ft == null ? null : Math.round(here.alt_ft / 10) * 10)} ft`,
    gs: here.gs_kt == null ? "—" : `${Math.round(here.gs_kt)} kt`,
    // To the 50 ft/min a VSI's needle is read to; level within it.
    vs: vs == null ? "—" : Math.abs(vs) < 50 ? "Level" : `${vs > 0 ? "+" : "−"}${grouped(Math.round(Math.abs(vs) / 50) * 50)} fpm`,
    trk: here.track_deg == null ? "—" : `${String(Math.round(here.track_deg) % 360 || 360).padStart(3, "0")}°`,
  };
}

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
  const gap = gapAt(track, t);
  const shown = gap ? null : figures(track, t);
  const rows: [string, string, string][] = shown
    ? [
        [ALT_NAME[track.altitude], shown.alt, "alt"],
        ["GS", shown.gs, "gs"],
        ["VS", shown.vs, "vs"],
        ["TRK", shown.trk, "trk"],
      ]
    : [];
  return (
    <div
      className={cn(GLASS, "pointer-events-none flex min-w-36 flex-col gap-0.5 rounded-(--radius-card) px-3 py-2 tabular-nums", className)}
      data-testid="replay-data-block"
      role="status"
    >
      <span className={cn("font-semibold", TEXT.row)} data-testid="replay-data-time">
        {replayTimes(t).zulu}
      </span>
      {gap ? (
        <span className={cn("text-muted-foreground", TEXT.note)} data-testid="replay-data-gap">
          No reports {replayTimes(gap.from).zulu}–{replayTimes(gap.to).zulu}
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
