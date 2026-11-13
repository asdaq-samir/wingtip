import { cn } from "cn";
import { GLASS } from "../../../lib/mapChrome";
import { Button } from "../../../components/ui/button";
import { openEmergency } from "../../../lib/emergencyStore";
import { clockTime, duration } from "../../../lib/format";
import { useGeo } from "../../../lib/geo";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { DRY_RUN, usePastFlight } from "../map/pastFlight";
import { GROUP_HEADING, TEXT } from "../../../lib/text";
import { dryRunAt, type DryRun } from "./navlog/dryRun";
import { dryRunNext, forgetPassed, gpsNext } from "./navlog/flyingTo";
import { isLegPoint, rowPoint, type NavLogRow } from "./navlog/rows";

/**
 * The next checkpoint, over the map in flight (useFlyingMode), as the
 * canvas's Flying screen draws it: its number and name, the distance and
 * time to it, and when the airplane is over it -- one glance, nothing to
 * read. Of the nav log's rows (`rows`), the tops of climb and descent
 * left out: a pilot looks for a lake, not a point on a leg.
 *
 * In a dry run every figure is the run's own (the shared engine's
 * dry_run, through navlog/dryRun): the row it is flying to (dryRunRow),
 * the distance flown to it (`bends`) less what is flown (dryRunAt), and
 * the moment it is reached (`rowT`). From the GPS, the first row not yet
 * passed -- passed once own ship has come within PASSED_NM of it, kept
 * here -- its distance from the fix along the great circle (lib/geo) and
 * the time at the fix's ground speed, with no figure of its own: the
 * strip's figures (FlightLine) stay the plan's.
 *
 * Drawn again as a figure changes -- a tenth of a mile, a minute -- not
 * at each of a run's frames, as the dry run's figures are (DryRunFigures).
 */

interface Next {
  index: number;
  number: number;
  name: string;
  nm: number;
  min: number | null;
  at: number | null;
}

/** Its number as the log counts the checkpoints: the departure 0. */
const numberOf = (rows: NavLogRow[], index: number) => rows.slice(1, index + 1).filter((r) => !isLegPoint(r)).length;

export default function FlyingHead({ run, rows }: { run: DryRun | null; rows: NavLogRow[] }) {
  const key = usePastFlight((s) => {
    if (!run || s.hex !== DRY_RUN || s.at === null) return "";
    const index = dryRunNext(run, rows, s.at);
    const at = dryRunAt(run, s.at);
    if (index === null || !at || !run.bends[index] || run.rowT[index] == null) return "";
    const along = run.alongNm.at(-1)! - at.leftNm;
    const nm = Math.max(0, run.bends[index]!.run - along);
    const min = Math.max(0, (run.rowT[index]! - s.at) / 60);
    return [index, nm.toFixed(1), Math.round(min), Math.floor(run.rowT[index]! / 60) * 60].join(" ");
  });
  // The distance to the next row is the engine's (lib/geo): no line from
  // the GPS until its .wasm is there, the rows passed kept meanwhile.
  const geo = useGeo();
  const gpsKey = useOwnShip((s) => {
    if (run || !s.enabled || !s.fix) {
      forgetPassed();
      return "";
    }
    if (!geo) return "";
    const index = gpsNext(geo, rows, s.fix);
    if (index === null) return "";
    const nm = geo.distanceNm(s.fix, rowPoint(rows[index]!));
    const min = s.fix.speedKt ? (nm / s.fix.speedKt) * 60 : null;
    const at = min === null ? null : Math.floor((s.fix.at / 1000 + min * 60) / 60) * 60;
    return [index, nm.toFixed(1), min === null ? "" : Math.round(min), at ?? ""].join(" ");
  });
  const words = key || gpsKey;
  if (!words) return null;
  const [i, nm, min, at] = words.split(" ");
  const index = Number(i);
  const next: Next = {
    index,
    number: numberOf(rows, index),
    name: rowPoint(rows[index]!).name,
    nm: Number(nm),
    min: min === "" ? null : Number(min),
    at: at === "" ? null : Number(at),
  };
  return (
    <div
      data-testid="flying-head"
      className={cn(
        GLASS,
        // Clear of the panel where it covers the map's side or top (the
        // map's insets, MapPage): over a wide screen it ran on under the
        // panel, its next point hidden there (the owner's screenshot,
        // 2026-11-06); on a phone's bottom sheet both are 0.
        "pointer-events-none absolute right-3 left-[calc(0.75rem+var(--map-inset-left,0px))] top-[calc(max(0.75rem,env(safe-area-inset-top))+var(--map-inset-top,0px))] z-[1000] flex items-center gap-3.5 rounded-(--radius-card) px-4 py-3",
        // In as the flight starts; not where the pilot asks for less motion.
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4 motion-safe:duration-300",
      )}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-caution font-bold text-white" aria-hidden="true">
        <span className={TEXT.card}>{next.number}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(GROUP_HEADING, "truncate")}>
          Next · <span data-testid="flying-next-name">{next.name}</span>
        </div>
        <div className="truncate text-3xl leading-[2.0625rem] font-bold tabular-nums" data-testid="flying-next-figures">
          {next.nm.toFixed(1)}
          <span className={cn(TEXT.title, "font-medium")}> nm</span>
          {next.min !== null && <> · {duration(next.min)}</>}
        </div>
      </div>
      {next.at !== null && (
        <div className="text-right">
          <div className={GROUP_HEADING}>ETA</div>
          <div className={cn(TEXT.card, "font-semibold tabular-nums")} data-testid="flying-next-eta">
            {clockTime(new Date(next.at * 1000))}
          </div>
        </div>
      )}
      {/* The emergency assistant's way in from flying mode, inside its own
          head rather than a map button (the owner removed EMER, 2026-11-08). */}
      <EmergencyEntry />
    </div>
  );
}

/** "Emergency", labelled in the system red, a 44-point target. */
function EmergencyEntry() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="flying-emergency"
      className="pointer-events-auto relative -mr-2 font-semibold text-destructive after:absolute after:-inset-1.5"
      onClick={() => openEmergency("flying")}
    >
      Emergency
    </Button>
  );
}
