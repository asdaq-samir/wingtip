import { cn } from "cn";
import { FINDING_TONE } from "../lib/findings";
import { useKeptAge, type KeptKind } from "../lib/kept/keptAge";
import { TEXT } from "../lib/text";

/**
 * "Fetched 42 min ago" over an answer the page is showing from what this
 * device kept, no signal to ask again (lib/kept): in the caution colour
 * once the engine's `kept_age` says it is past its freshness, muted
 * before. Nothing while the answer is the network's own. A label, never
 * a stop: the answer under it stays (warn, never limit).
 */
export default function KeptAge({
  kind,
  path,
  atMs,
  failed,
  className,
}: {
  kind: KeptKind;
  /** The planner's address it came from, as the service worker marks it. */
  path?: string;
  /** When the page got it. */
  atMs: number | null;
  /** The last ask for it failed, and the page kept what it had. */
  failed?: boolean;
  className?: string;
}) {
  const age = useKeptAge(kind, { path, atMs, failed });
  if (!age) return null;
  return (
    <p
      className={cn(TEXT.detail, age.finding === "caution" ? FINDING_TONE.caution : "text-muted-foreground", className)}
      data-testid={`kept-age-${kind}`}
      data-finding={age.finding}
      title={`${age.detail} (${age.source})`}
    >
      {age.line}
    </p>
  );
}
