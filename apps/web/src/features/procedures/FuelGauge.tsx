import { Meter } from "react-aria-components";
import { cn } from "cn";
import { TEXT } from "../../lib/text";

/**
 * The fuel in the tanks as a gauge and its gallons, as Tesla's trip planner
 * draws a charger's battery on arrival (the owner's screenshot, 2026-10-21):
 * the share of the tanks left, filled. A fuel stop's in the text's own
 * colour, a step up from the grey, not the caution's amber, which means a
 * caution wherever it is drawn (the owner, 2026-11-17: "Yes to all recs");
 * one under the reserve the flight is held to in red.
 *
 * With the tanks' size known it is React Aria's stock Meter (role meter,
 * its value the gallons over the usable fuel), so VoiceOver hears "Fuel in
 * the tanks, 23 gal" as a gauge rather than a picture and a number; the
 * stock part works out the share, clamped to the tanks. Without it, the
 * gallons alone, no gauge to read.
 *
 * `when` says it as a line of words under a point's ident in FPL's
 * timeline, "36 gal on arrival", no gauge (the owner, 2026-11-20, the
 * readability list's B: the gauge after the ident read as part of it).
 */
export function FuelGauge({ gal, usable, tone, when }: { gal: number; usable: number | null; tone?: "fuel" | "low"; when?: string }) {
  const look = cn(
    "inline-flex shrink-0 items-center gap-1 tabular-nums",
    when ? "font-normal" : "font-semibold",
    TEXT.note,
    tone === "low" ? "text-destructive-ink" : tone === "fuel" ? "text-foreground" : "text-muted-foreground",
  );
  const words = `${Math.floor(gal)} gal${when ? ` ${when}` : ""}`;
  if (!usable || when)
    return (
      <span className={look}>
        <span className="sr-only">Fuel in the tanks </span>
        {words}
      </span>
    );
  return (
    <Meter aria-label="Fuel in the tanks" value={gal} maxValue={usable} valueLabel={words} className={look}>
      {({ percentage }) => (
        <>
          {/* Drawn as a gauge, its edge in the words' colour and the share
              left filled in it, as iOS draws a battery: a grey bar on a grey
              track read as text blacked out (the owner's "your canvas looks
              much prettier than the actual app", 2026-10-26). A sliver kept
              at empty, so an empty gauge still reads as one. */}
          <span aria-hidden="true" className="inline-flex h-3 w-6 rounded-[3.5px] border-[1.5px] border-current p-px opacity-90">
            <span className="h-full rounded-[1.5px] bg-current" style={{ width: `${Math.max(10, percentage)}%` }} />
          </span>
          {/* Said as the meter's value (valueLabel), so not read twice. */}
          <span aria-hidden="true">{words}</span>
        </>
      )}
    </Meter>
  );
}
