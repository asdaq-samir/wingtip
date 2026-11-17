import type { ReactNode } from "react";
import { cn } from "cn";
import { GLASS } from "../../../lib/mapChrome";
import { Button } from "../../../components/ui/button";
import { openEmergency } from "../../../lib/emergencyStore";
import { clockTime, duration } from "../../../lib/format";
import { useEngineReady } from "../../../lib/engine/useEngineReady";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { DRY_RUN, usePastFlight } from "../map/pastFlight";
import { GROUP_HEADING, TEXT } from "../../../lib/text";
import { dryRunAt, type DryRun } from "./navlog/dryRun";
import { dryRunNext, gpsAhead, type CourseLine } from "./navlog/flyingTo";
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
 * the moment it is reached (`rowT`). From the GPS every figure is the
 * engine's in_flight (navlog/flyingTo's gpsAhead), as the phones' InFlight
 * asks it: the next checkpoint along the course line (`line`), its
 * distance direct from the fix, the time at the fix's ground speed and
 * the arrival, with no figure of its own: the strip's figures
 * (TripFigures) stay the plan's. Off the route -- the engine's `on_route`
 * false -- there is no next checkpoint to give, and the head is Emergency
 * alone, as the iPhone's instruments drop their Next row (InstrumentsBar).
 *
 * Drawn again as a figure changes -- a tenth of a mile, a minute -- not
 * at each of a run's frames, as the dry run's figures are (DryRunFigures).
 */

/** FlyingHead's word for off the route, in place of the next's figures. */
const OFF_ROUTE = "off";

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

export default function FlyingHead({ run, rows, line }: { run: DryRun | null; rows: NavLogRow[]; line: CourseLine }) {
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
  // The next checkpoint from the GPS is the engine's (in_flight): no line
  // until its .wasm is there.
  const engine = useEngineReady();
  const gpsKey = useOwnShip((s) => {
    if (run || !engine || !s.enabled || !s.fix) return "";
    const next = gpsAhead(rows, line, s.fix);
    if (next === null) return "";
    // Off the route (the engine's on_route false: more than its 3 nm from
    // the line, or below flying speed), no next checkpoint, as the phones'
    // instruments leave theirs out: the head keeps only Emergency.
    if (!next.onRoute) return OFF_ROUTE;
    const at = next.at === null ? null : Math.floor(next.at / 60) * 60;
    return [next.index, next.nm.toFixed(1), next.min === null ? "" : Math.round(next.min), at ?? ""].join(" ");
  });
  const words = key || gpsKey;
  if (!words) return null;
  if (words === OFF_ROUTE)
    return (
      <Head off>
        <EmergencyEntry />
      </Head>
    );
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
    <Head>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-caution font-bold text-white" aria-hidden="true">
        <span className={TEXT.card}>{next.number}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(GROUP_HEADING, "truncate")}>
          Next · <span data-testid="flying-next-name">{next.name}</span>
        </div>
        <div className={cn("truncate font-bold tabular-nums", TEXT.hero)} data-testid="flying-next-figures">
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
    </Head>
  );
}

/** The head's glass at the map's top. Off the route (`off`) it is
 *  Emergency alone, at the right, as wide as it. */
function Head({ off = false, children }: { off?: boolean; children: ReactNode }) {
  return (
    <div
      data-testid="flying-head"
      data-off-route={off || undefined}
      className={cn(
        GLASS,
        // Clear of the panel where it covers the map's side or top (the
        // map's insets, MapPage): over a wide screen it ran on under the
        // panel, its next point hidden there (the owner's screenshot,
        // 2026-11-06); on a phone's bottom sheet both are 0.
        "pointer-events-none absolute right-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+var(--map-inset-top,0px))] z-[1000] flex items-center gap-3.5 rounded-(--radius-card) px-4 py-3",
        off ? "w-fit" : "left-[calc(0.75rem+var(--map-inset-left,0px))]",
        // In as the flight starts; not where the pilot asks for less motion.
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4 motion-safe:duration-300",
      )}
    >
      {children}
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
