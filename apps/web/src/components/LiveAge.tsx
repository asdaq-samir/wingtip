import { cn } from "cn";
import { liveAge, type Freshness } from "../lib/kept/liveAge";
import { useOnline } from "../lib/kept/useOnline";
import { useMinuteClock } from "../lib/useMinuteClock";

/**
 * Every live figure's age, where it is read, in a few characters ("12m"),
 * greyed once the engine's freshness rule says it is stale, and "offline"
 * beside it in the row it affects while the browser has no network (the
 * FPL redesign, the owner 2026-11-17). A label, never a stop: the figure
 * stays (warn, never limit). A screen reader hears it whole.
 */
export default function LiveAge({
  at,
  what,
  className,
  testId = "live-age",
}: {
  /** When it was observed or fetched: an ISO time or milliseconds. */
  at: string | number | null | undefined;
  what: Freshness;
  className?: string;
  testId?: string;
}) {
  const now = useMinuteClock();
  const online = useOnline();
  const atMs = typeof at === "string" ? Date.parse(at) : at;
  const age = liveAge(what, atMs, now);
  if (!age) return null;
  const said = `${age.words === "now" ? "just now" : `${age.words} old`}${age.stale ? ", stale" : ""}${online ? "" : ", offline"}`;
  return (
    // In the text colour while fresh, greyed once stale: the grey is
    // the meaning, no amber and no word added (colour only for meaning).
    <span
      className={cn("tabular-nums", age.stale ? "text-muted-foreground" : "text-foreground", className)}
      data-stale={age.stale || undefined}
      data-testid={testId}
      title={said}
    >
      <span aria-hidden="true">
        {age.words}
        {!online && " · offline"}
      </span>
      <span className="sr-only">{said}</span>
    </span>
  );
}
