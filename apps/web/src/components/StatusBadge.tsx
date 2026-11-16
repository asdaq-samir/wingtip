import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "./ui/badge";
import { TEXT } from "../lib/text";
import { chipFillOf } from "../lib/map/marks/flightCategory";

/**
 * The statuses a pilot scans for, each a fill from design/tokens.json
 * (color.badge.status-*) under white words at 4.5:1 or more, and the word
 * it says when the caller gives none. The owner, 2026-11-14: "Use badges
 * where we can for example tfr active etc." (docs/design/rules.md, 9).
 */
const STATUS = {
  /** In force now: a TFR, a NOTAM, a special-use area hot. */
  active: { fill: "bg-(--badge-status-active)", word: "Active" },
  /** In force later today, not yet ("Active 1400Z"). */
  later: { fill: "bg-(--badge-status-later)", word: "Later" },
  /** Scheduled but not in use now: a special-use area cold. */
  cold: { fill: "bg-(--badge-status-cold)", word: "Cold" },
  /** Closed by NASR or a NOTAM (decision 0043): never shown as open. */
  closed: { fill: "bg-(--badge-status-closed)", word: "Closed" },
  /** A navaid or a service not working. */
  "out-of-service": { fill: "bg-(--badge-status-out-of-service)", word: "Out of service" },
  /** A field's use where it is not public (NASR's use and ownership). */
  private: { fill: "bg-(--badge-status-private)", word: "Private" },
  military: { fill: "bg-(--badge-status-military)", word: "Military" },
  joint: { fill: "bg-(--badge-status-joint)", word: "Joint use" },
  /** A tracked airplane: flying, on the ground, squawking an emergency. */
  inAir: { fill: "bg-(--badge-air)", word: "In the air" },
  ground: { fill: "bg-(--badge-status-ground)", word: "On the ground" },
  emergency: { fill: "bg-(--badge-status-emergency)", word: "Emergency" },
} as const;

export type Status = keyof typeof STATUS;

/** Green up, red down, grey unknown -- and amber, pulsing, for
 *  something under way (a training run). The developer's pages only. */
export type Tone = "up" | "down" | "checking" | "running";

const TONES: Record<Tone, string> = {
  up: "bg-go",
  down: "bg-destructive",
  checking: "bg-muted-foreground/40",
  running: "animate-pulse bg-caution",
};

const FILLED = cn("h-auto rounded-full px-2 py-0.5 align-middle text-white", TEXT.badge);

/**
 * The app's one status badge, on shadcn's Badge, in one of three forms:
 *
 * - `variant`: a status a pilot scans for (Active, Closed, Private, In
 *   the air), filled in its colour with its word in white. The word is
 *   the badge's own text, so a screen reader hears it; `children` says
 *   more where the status needs it ("Active until 2200Z", "Closed
 *   indefinitely").
 * - `category`: a flight category (AIM 7-1-7), filled in its chip colour
 *   (chipFillOf: LIFR's deeper magenta, 6.4:1 under white).
 * - `tone` or `color`: the developer pages' outlined pill with a dot in
 *   the state's colour (a service up or down, a training run).
 *
 * Words that explain stay text beside it, not in a badge.
 */
export default function StatusBadge({
  variant,
  category,
  tone,
  color,
  className,
  children,
  ...rest
}: {
  variant?: Status;
  category?: string | null;
  tone?: Tone;
  color?: string;
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  if (variant)
    return (
      <Badge className={cn(FILLED, STATUS[variant].fill, className)} data-status={variant} {...rest}>
        {children ?? STATUS[variant].word}
      </Badge>
    );
  if (category)
    return (
      <Badge
        className={cn(FILLED, "font-bold tracking-wide", className)}
        style={{ backgroundColor: chipFillOf(category) }}
        data-category={category}
        {...rest}
      >
        {children ?? category}
      </Badge>
    );
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)} {...rest}>
      <span
        aria-hidden
        className={cn("inline-block size-2.5 shrink-0 rounded-full", tone && TONES[tone])}
        style={color ? { backgroundColor: color } : undefined}
      />
      {children}
    </Badge>
  );
}

/** A status line that may lead with a status (lib/airplane/lookup
 *  StatusWords): its badge, then the words after it; else the words. */
export function StatusLine({ words }: { words: { text: string; badge?: Status; rest?: string } }) {
  if (!words.badge) return <>{words.text}</>;
  return (
    <>
      <StatusBadge variant={words.badge} />
      {words.rest ? ` ${words.rest}` : null}
    </>
  );
}
